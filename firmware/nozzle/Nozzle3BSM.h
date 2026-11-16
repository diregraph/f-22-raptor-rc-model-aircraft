// Three-bearing swivel nozzle: the nozzle board's controller. Header only, no Arduino calls, so the same file runs on the
// board (nozzle_board/nozzle_board.ino, an RP2040 driving three N20 gearmotors through two DRV8833) and in the host test
// (host_test.cpp, run by tools/nozzle-firmware-test.mjs).
//
// In, every loop:  two pulse widths from the flight controller (deflection 0..100 deg = 1000..2000 us, yaw swing
//                  -20..+20 deg = 1000..2000 us; firmware/nozzle/nozzle_3bsm.lua sends them), and the three encoder counts.
// Out:             a duty for each motor (-1..1), the joint angles it believes, and its state.
//
// Power-up: the board does not know where the joints are. It drives joints 2 and 3 slowly onto their stops (a lug on each
// collar meets the motor plate), then joint 1, counts from there, and only then moves to what the flight controller asks for,
// slowly at first. The geometry is a line-for-line port of site/js/nozzle.js; keep the two in step (the host test checks them).
#pragma once
#include <math.h>
#include <stdint.h>

namespace nozzle {

struct Config {
  float alpha = 40.0f;                        // cant of bearings 2 and 3, degrees
  float maxDeflection = 100.0f, maxYaw = 20.0f;
  float ring[3] = {100, 110, 110}, pinion = 14;   // gear teeth (cad/propulsion.py Z_RING, Z_PIN)
  float gearbox = 100.0f, cpr = 12.0f;        // N20 gearbox ratio; encoder counts per motor turn, both edges of both channels
  float freeSpeed = 1920.0f;                  // deg/s at the gearbox shaft with no load at full duty (320 rpm on 6 V)
  float stop[3] = {-62.0f, -8.0f, 8.0f};      // joint angle at each homing stop (cad/propulsion.py STOP_Q). Check on the bench
  int8_t dir[3] = {1, 1, 1};                  // -1 if a motor or its encoder is wired the other way round (bench step 6)
  float homeDuty = 0.35f;                     // gentle: the lug must not shear. About 0.8 kg cm at the gearbox shaft
  float homeStall = 0.25f;                    // s without movement on the stop = homed
  float deflRate = 150.0f, yawRate = 100.0f;  // deg/s (site/js/sim.js tiltRate, nozzleRate)
  float startRate = 30.0f;                    // deg/s per joint, from the homing pose to the first command
  float kp = 0.05f, ki = 0.30f;               // duty per degree, duty per degree-second
  float iMax = 0.5f, dutyMax = 1.0f;          // integral share (what holding the jet's load takes) and total duty
  float deadband = 0.1f;                      // degrees: inside this the motor only holds the load, so it does not buzz
  float pulseTimeout = 0.1f;                  // s without a good pulse = hold the last command
};

enum State : uint8_t { HOMING_BEND = 0, HOMING_ROLL = 1, WAITING = 2, RUNNING = 3 };
struct Joints { float a, b, c; };
struct Output { float duty[3], q[3], target[3], deflection, yaw; State state; bool signalOk; };

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
  explicit Nozzle(const Config& c = Config()) : cfg(c) {}

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

  // Same as countsPerDeg() in nozzle.js
  float countsPerDeg(int i) const { return cfg.ring[i] / cfg.pinion * cfg.gearbox * cfg.cpr / 360.0f; }

  // Pulse widths -> commands. Returns false for a missing or nonsense pulse.
  static bool decode(uint16_t usDefl, uint16_t usYaw, float& defl, float& yaw) {
    if (usDefl < 900 || usDefl > 2100 || usYaw < 900 || usYaw > 2100) return false;
    defl = clampf((usDefl - 1000.0f) / 10.0f, 0.0f, 100.0f); yaw = clampf((usYaw - 1500.0f) / 25.0f, -20.0f, 20.0f);
    return true;
  }

  // Call once per loop (1 kHz on the board). counts: raw encoder counts, any starting value.
  Output update(float dt, uint16_t usDefl, uint16_t usYaw, const int32_t counts[3]) {
    Output o{};
    float d, y;
    if (decode(usDefl, usYaw, d, y)) { wantDefl = d; wantYaw = y; quiet = 0; seen = true; }
    else quiet += dt;                                                    // lost: keep the last good command
    o.signalOk = seen && quiet < cfg.pulseTimeout;
    for (int i = 0; i < 3; i++) {
      float q = (float)(counts[i] - zero[i]) * cfg.dir[i] / countsPerDeg(i) + cfg.stop[i];
      rate[i] = dt > 0 ? (q - q_[i]) / dt : 0.0f; q_[i] = q;
      if (fabsf(q - stillAt[i]) > 0.3f) { stillAt[i] = q; still[i] = 0; } else still[i] += dt;
    }
    if (state == HOMING_BEND || state == HOMING_ROLL) {                   // joints 2 and 3 together, then joint 1
      bool done = true;
      for (int i = 0; i < 3; i++) {
        bool mine = state == HOMING_BEND ? i > 0 : i == 0;
        if (!mine || homed[i]) continue;
        float toward = cfg.stop[i] > 0 || i == 0 ? 1.0f : -1.0f;          // stops sit past the top of joints 1 and 3, below joint 2
        if (homeTime[i] > 0.3f && still[i] > cfg.homeStall) { homed[i] = true; zero[i] = counts[i]; q_[i] = stillAt[i] = cfg.stop[i]; continue; }
        homeTime[i] += dt; drive[i] = toward * cfg.homeDuty; done = false;
      }
      if (done) state = state == HOMING_BEND ? HOMING_ROLL : WAITING;
      for (int i = 0; i < 3; i++) if (homed[i]) { drive[i] = 0; target[i] = q_[i]; }
    }
    if (state == WAITING && o.signalOk) { state = RUNNING; defl = wantDefl; yaw = 0; started = false; }
    if (state == RUNNING) {
      defl += clampf(wantDefl - defl, -cfg.deflRate * dt, cfg.deflRate * dt);
      float yl = yawLimit(defl);
      yaw = clampf(yaw + clampf(clampf(wantYaw, -yl, yl) - yaw, -cfg.yawRate * dt, cfg.yawRate * dt), -yl, yl);
      Joints j = solve(defl, yaw); float want[3] = {j.a, j.b, j.c};
      bool there = true;
      for (int i = 0; i < 3; i++) {
        float step = started ? 1e9f : cfg.startRate * dt;                 // first move off the stops: slowly
        float moved = clampf(want[i] - target[i], -step, step);
        target[i] += moved;
        there = there && fabsf(want[i] - target[i]) < 0.01f;
        float e = target[i] - q_[i], ff = dt > 0 ? moved / dt / (cfg.freeSpeed * cfg.pinion / cfg.ring[i]) : 0.0f;   // feed-forward: the duty that runs at the target's speed
        if (fabsf(e) < cfg.deadband && fabsf(ff) < 1e-3f) { drive[i] = integ[i]; continue; }   // there: hold the load, no hunting
        integ[i] = clampf(integ[i] + cfg.ki * e * dt, -cfg.iMax, cfg.iMax);
        drive[i] = clampf(ff + cfg.kp * e + integ[i], -cfg.dutyMax, cfg.dutyMax);
      }
      started = started || there;
    }
    for (int i = 0; i < 3; i++) { o.duty[i] = drive[i] * cfg.dir[i]; o.q[i] = q_[i]; o.target[i] = target[i]; }
    o.deflection = defl; o.yaw = yaw; o.state = state;
    return o;
  }

  Config cfg;

 private:
  State state = HOMING_BEND;
  bool homed[3] = {false, false, false}, seen = false, started = false;
  int32_t zero[3] = {0, 0, 0};
  float q_[3] = {0, 0, 0}, rate[3] = {0, 0, 0}, stillAt[3] = {0, 0, 0}, still[3] = {0, 0, 0}, homeTime[3] = {0, 0, 0};
  float drive[3] = {0, 0, 0}, integ[3] = {0, 0, 0}, target[3] = {0, 0, 0};
  float wantDefl = 0, wantYaw = 0, quiet = 1e9f, defl = 0, yaw = 0;
};

}  // namespace nozzle
