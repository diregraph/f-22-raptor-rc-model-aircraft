// Three-bearing swivel nozzle controller. Header only, no Arduino calls, so the same file runs on the ESP32 flight
// controller (madflight) and in the host test (firmware/nozzle/host_test.cpp, run by tools/nozzle-firmware-test.mjs).
//
// Inputs, every loop:  wanted deflection (0 = straight aft, 90 = straight down, 100 = braking), wanted yaw swing,
//                      forward airspeed, whether the aircraft is on the ground, and whether the radio link is good.
// Outputs:             two servo pulses (us) for the cord drums, the deflection and yaw actually reached,
//                      and the largest main-fan thrust the nozzle can hold at that deflection (fraction of full).
//
// The geometry is a line-for-line port of site/js/nozzle.js; keep the two in step (the host test checks them).
// The thrust limit table comes from site/js/nozzle-loads.js via tools/nozzle-loads.mjs, which writes NozzleLimits.h.
#pragma once
#include <math.h>
#include <stdint.h>
#include "NozzleLimits.h"

namespace nozzle {

struct Config {
  float alpha = 40.0f;                    // cant of bearings 2 and 3, degrees
  float maxDeflection = 100.0f, maxYaw = 20.0f;
  float band1 = 48.3f, ring = 50.0f, collar = 53.4f, drum = 27.5f;   // cord radii, mm (cad/propulsion.py prints them)
  float servoHalfTravel = 85.0f;          // degrees either side of centre
  float usPerDeg = 1000.0f / 90.0f;       // MG90S: 500-2500 us over about 180 degrees. Measure yours (see docs)
  int16_t trimUs[2] = {0, 0};             // pulse offset that centres each drum, found when stringing
  int8_t dir[2] = {1, 1};                 // -1 if a servo turns the wrong way
  float backlashDeg[2] = {0.0f, 0.0f};    // cord slack, in servo degrees, taken up on every reversal (bench step 6)
  float deflRate = 150.0f;                // deg/s of deflection the servos are asked to follow (site/js/sim.js tiltRate)
  float yawRate = 300.0f;                 // deg/s of yaw swing                                  (sim.js nozzleRate)
  float guardDeg = 35.0f;                 // hover guard: keep at least this much deflection while slow and airborne
  float guardFull = 6.0f, guardOff = 17.0f;   // airspeed (m/s) below which the guard is fully on, above which it is off
  float startRate = 30.0f;                // deg/s at power-up, so a badly strung nozzle cannot snap a cord
};

struct Joints { float a, b, c; };
struct Output { uint16_t us[2]; float deflection, yaw, servoDeg[2], thrustCap; bool guarded, limited; };

static constexpr float RAD = 3.14159265358979f / 180.0f;
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }

// Rodrigues rotation of v about unit axis k by t radians
static inline void rotv(const float k[3], float t, float v[3]) {
  float c = cosf(t), s = sinf(t), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  float x = k[1] * v[2] - k[2] * v[1], y = k[2] * v[0] - k[0] * v[2], z = k[0] * v[1] - k[1] * v[0];
  for (int i = 0; i < 3; i++) v[i] = v[i] * c + (i == 0 ? x : i == 1 ? y : z) * s + k[i] * d * (1 - c);
}

class Nozzle {
 public:
  explicit Nozzle(const Config& c = Config()) : cfg(c) { findCentres(); }

  // Same as yawLimit() in nozzle.js: past 90 degrees the yaw swing tapers from 20 to 8 degrees to clear the tail booms.
  float yawLimit(float d) const { return cfg.maxYaw - fmaxf(0.0f, d - 90.0f) * 1.2f; }

  // Same as solve() in nozzle.js: deflection and yaw -> the three joint angles (degrees)
  Joints solve(float deflection, float yaw) const {
    float d = clampf(deflection, 0.0f, cfg.maxDeflection), sa = sinf(cfg.alpha * RAD);
    float b = 2.0f * asinf(fminf(1.0f, sinf(d * RAD / 4.0f) / sa)) / RAD;
    float bz = fmaxf(b, 0.5f), e[3] = {1, 0, 0};
    float n2[3] = {cosf(cfg.alpha * RAD), sinf(cfg.alpha * RAD), 0}, n3[3] = {cosf(cfg.alpha * RAD), -sinf(cfg.alpha * RAD), 0};
    rotv(n3, -bz * RAD, e); rotv(n2, bz * RAD, e);                      // exitDirection(0, bz, -bz)
    float az = atan2f(e[2], -e[1]) / RAD, yl = yawLimit(d);
    return {az - clampf(yaw, -yl, yl), b, -b};
  }

  // Same as servoAngles() in nozzle.js: degrees from each servo's centre
  void servoAngles(const Joints& j, float s[2]) const {
    float k = cfg.collar / cfg.ring, band = j.a, ring = j.a + k * j.b;
    s[0] = (band - centreBand) * cfg.band1 / cfg.drum;
    s[1] = (ring - centreRing) * cfg.ring / cfg.drum;
  }

  // Largest main-fan thrust the cord servos can hold at this deflection, as a fraction of full thrust (NozzleLimits.h).
  static float thrustCap(float d) {
    float x = clampf(d, 0.0f, LIMIT_STEP * (LIMIT_N - 1)) / LIMIT_STEP;
    int i = (int)x; if (i >= LIMIT_N - 1) return LIMIT_CAP[LIMIT_N - 1];
    float f = x - i; return LIMIT_CAP[i] + (LIMIT_CAP[i + 1] - LIMIT_CAP[i]) * f;
  }

  // Call once per loop. airspeed in m/s along the body; dt in seconds.
  Output update(float dt, float wantDefl, float wantYaw, float airspeed, bool onGround, bool linkOk) {
    Output o{};
    if (!linkOk) { wantDefl = lastWant; wantYaw = 0.0f; }               // radio lost: hold the deflection, centre the yaw
    lastWant = wantDefl;
    // hover guard: slow and airborne, nothing aft of the balance point holds the tail up unless the jet is bent down
    float s = clampf((airspeed - cfg.guardFull) / (cfg.guardOff - cfg.guardFull), 0.0f, 1.0f);
    float guard = onGround ? 0.0f : cfg.guardDeg * (1.0f - s * s * (3.0f - 2.0f * s));
    float target = clampf(fmaxf(wantDefl, guard), 0.0f, cfg.maxDeflection);
    o.guarded = target > wantDefl + 0.01f;
    float rate = started ? cfg.deflRate : cfg.startRate;
    if (!initialised) { defl = RIG_DEFLECTION; yaw = 0.0f; initialised = true; }   // assume the pose it was strung in, and move off it slowly
    defl += clampf(target - defl, -rate * dt, rate * dt);
    float yl = yawLimit(defl);
    yaw += clampf(clampf(wantYaw, -yl, yl) - yaw, -cfg.yawRate * dt, cfg.yawRate * dt);
    yaw = clampf(yaw, -yl, yl);
    if (fabsf(target - defl) < 0.5f) started = true;
    float sd[2]; servoAngles(solve(defl, yaw), sd);
    for (int i = 0; i < 2; i++) {
      // backlash: when the drum reverses, overshoot the slack so the far cord picks up the load
      float dv = sd[i] - prevServo[i];
      if (fabsf(dv) > 0.05f) lastSign[i] = dv > 0 ? 1 : -1;
      prevServo[i] = sd[i];
      float cmd = sd[i] + lastSign[i] * cfg.backlashDeg[i] * 0.5f;
      o.limited |= fabsf(cmd) > cfg.servoHalfTravel;
      cmd = clampf(cmd, -cfg.servoHalfTravel, cfg.servoHalfTravel);
      o.servoDeg[i] = cmd;
      o.us[i] = (uint16_t)lroundf(clampf(1500.0f + cfg.dir[i] * cmd * cfg.usPerDeg + cfg.trimUs[i], 500.0f, 2500.0f));
    }
    o.deflection = defl; o.yaw = yaw; o.thrustCap = thrustCap(defl);
    return o;
  }

  // Pose for stringing the cords: both servos sit near their centres at 45 degrees (docs/ducted-propulsion.md, step 4).
  static constexpr float RIG_DEFLECTION = 45.0f;

  Config cfg;
  float centreBand = 0, centreRing = 0;

 private:
  float defl = 0, yaw = 0, lastWant = 90.0f, prevServo[2] = {0, 0};
  int8_t lastSign[2] = {1, 1};
  bool initialised = false, started = false;

  // Same as jointCentres() in nozzle.js: mid-travel of each pulley over every pose the mixer can ask for
  void findCentres() {
    float k = cfg.collar / cfg.ring, bandLo = 1e9f, bandHi = -1e9f, ringLo = 1e9f, ringHi = -1e9f;
    for (int d = 0; d <= (int)cfg.maxDeflection; d++)
      for (int y = -1; y <= 1; y++) {
        Joints j = solve((float)d, y * yawLimit((float)d));
        float band = j.a, ring = j.a + k * j.b;
        bandLo = fminf(bandLo, band); bandHi = fmaxf(bandHi, band); ringLo = fminf(ringLo, ring); ringHi = fmaxf(ringHi, ring);
      }
    centreBand = (bandLo + bandHi) / 2; centreRing = (ringLo + ringHi) / 2;
  }
};

}  // namespace nozzle
