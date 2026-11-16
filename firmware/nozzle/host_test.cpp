// Host build of the nozzle controller for tools/nozzle-firmware-test.mjs. Prints one JSON object.
#include <stdio.h>
#include "Nozzle3BSM.h"
using namespace nozzle;
int main() {
  Nozzle nz;
  printf("{\"centres\":[%.4f,%.4f],\"poses\":[", nz.centreBand, nz.centreRing);
  bool first = true;
  for (int d = 0; d <= 100; d += 5)
    for (int y = -20; y <= 20; y += 10) {
      Joints j = nz.solve((float)d, (float)y); float s[2]; nz.servoAngles(j, s);
      printf("%s[%d,%d,%.4f,%.4f,%.4f,%.4f]", first ? "" : ",", d, y, j.a, j.b, s[0], s[1]); first = false;
    }
  printf("],\"caps\":[");
  for (int d = 0; d <= 100; d += 10) printf("%s%.4f", d ? "," : "", Nozzle::thrustCap((float)d));
  // a flight: power up and go to 90, pilot asks for 0 deg at 2 m/s (guard holds it), speeds up, yaws, then the link drops
  printf("],\"run\":[");
  Nozzle f; first = true;
  for (int i = 0; i < 4000; i++) {
    float t = i * 0.0025f, v = t < 4 ? 2.0f : t < 8 ? 2.0f + (t - 4) * 5.0f : 22.0f;
    bool link = t < 9.0f;
    float want = t < 3 ? 90.0f : 0.0f, yaw = t > 8 && t < 10 ? 30.0f : 0.0f;
    Output o = f.update(0.0025f, want, yaw, v, false, link);
    if (i % 40 == 0) { printf("%s[%.3f,%.3f,%.3f,%d,%d,%.4f,%d]", first ? "" : ",", t, o.deflection, o.yaw, o.us[0], o.us[1], o.thrustCap, o.guarded); first = false; }
  }
  printf("]}\n");
}
