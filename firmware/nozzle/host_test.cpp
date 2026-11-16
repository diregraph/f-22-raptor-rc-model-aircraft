// Host build of the nozzle board's controller for tools/nozzle-firmware-test.mjs. Prints one JSON object.
// It runs the controller against a simple model of the three joints: brushed gearmotors (speed falls in a straight line
// to stall), the ring gears, the jet's load and bearing friction, and the homing stops.
#include <stdio.h>
#include <math.h>
#include "Nozzle3BSM.h"
using namespace nozzle;

struct Plant {   // one joint, quasi-static: the joint is light, so the motor runs at the speed its torque balance allows
  float q, ratio, cpd, w = 0;                      // joint angle, ring/pinion, encoder counts per joint degree, motor shaft deg/s
  float stall = 2.2f, free = 320 * 6.0f;           // kg cm and deg/s at the gearbox shaft (N20 100:1 on 6 V)
  float load, fric, lo, hi;                        // kg cm at the gearbox shaft: jet load (signed) and friction; the stops
  int32_t c0;
  void step(float dt, float duty) {
    float drive = duty * stall - load, wt = 0;     // torque left over to turn the joint
    if (fabsf(drive) > fric) wt = (drive - copysignf(fric, drive)) / stall * free;
    w += (wt - w) * fminf(1.0f, dt / 0.03f);       // 30 ms motor lag
    q += w / ratio * dt;
    if (q < lo) { q = lo; w = fmaxf(w, 0); } if (q > hi) { q = hi; w = fminf(w, 0); }
  }
  int32_t counts() const { return c0 + (int32_t)floorf(q * cpd); }
};

int main() {
  Nozzle nz;
  printf("{\"cpd\":[%.4f,%.4f,%.4f],\"poses\":[", nz.countsPerDeg(0), nz.countsPerDeg(1), nz.countsPerDeg(2));
  bool first = true;
  for (int d = 0; d <= 100; d += 5)
    for (int y = -20; y <= 20; y += 10) {
      Joints j = nz.solve((float)d, (float)y);
      printf("%s[%d,%d,%.4f,%.4f,%.4f]", first ? "" : ",", d, y, j.a, j.b, j.c); first = false;
    }
  // A bench run. The joints start somewhere the board does not know; the flight controller asks for 90 deg (hover) from
  // the start, swings the yaw at 10 s, goes to 0 deg at 12 s, and the signal wire comes off at 15 s.
  // Loads at full thrust, 90 deg (tools/nozzle-loads.mjs): about 0.1 / 0.6 / 0.1 kg cm at the gearbox shafts.
  Plant P[3];
  float start[3] = {-100.0f, 40.0f, -40.0f}, load[3] = {0.10f, -0.45f, 0.10f};
  for (int i = 0; i < 3; i++) {
    P[i].q = start[i]; P[i].ratio = nz.cfg.ring[i] / nz.cfg.pinion; P[i].cpd = nz.countsPerDeg(i); P[i].load = load[i]; P[i].fric = 0.15f;
    P[i].lo = nz.cfg.stop[i] > 0 || i == 0 ? nz.cfg.stop[i] - 170 : nz.cfg.stop[i]; P[i].hi = P[i].lo + 170;
    P[i].c0 = 12345 * (i + 1) - (int32_t)floorf(start[i] * P[i].cpd);
  }
  printf("],\"run\":[");
  first = true;
  const float dt = 0.001f;
  for (int k = 0; k < 17000; k++) {
    float t = k * dt;
    uint16_t ud = t < 12 ? 1900 : 1000, uy = t > 10 && t < 11 ? 1500 + 15 * 25 : 1500;
    if (t > 15) ud = uy = 0;
    int32_t c[3] = {P[0].counts(), P[1].counts(), P[2].counts()};
    Output o = nz.update(dt, ud, uy, c);
    for (int i = 0; i < 3; i++) P[i].step(dt, o.duty[i]);
    if (k % 20 == 0) {
      printf("%s[%.3f,%d,%d,%.3f,%.3f", first ? "" : ",", t, (int)o.state, o.signalOk ? 1 : 0, o.deflection, o.yaw); first = false;
      for (int i = 0; i < 3; i++) printf(",%.3f,%.3f,%.3f,%.3f", P[i].q, o.q[i], o.target[i], o.duty[i]);
      printf("]");
    }
  }
  printf("]}\n");
}
