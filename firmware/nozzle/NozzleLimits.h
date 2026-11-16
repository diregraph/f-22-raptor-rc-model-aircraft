// Written by tools/nozzle-loads.mjs from site/js/nozzle-loads.js. Do not edit by hand: change the model and rerun.
// Largest main-fan thrust the cord servos (MG90S on 6 V, 70% of stall) can hold, as a fraction of
// full thrust (958 g), every 5 degrees of deflection from 0 to 100. Bearings with PTFE washers.
#pragma once
namespace nozzle {
static constexpr int LIMIT_N = 21;
static constexpr float LIMIT_STEP = 5.0f;
static constexpr float LIMIT_CAP[LIMIT_N] = {1.000f, 1.000f, 1.000f, 1.000f, 1.000f, 1.000f, 0.931f, 0.803f, 0.708f, 0.634f, 0.575f, 0.528f, 0.490f, 0.458f, 0.431f, 0.409f, 0.389f, 0.374f, 0.360f, 0.352f, 0.344f};
}
