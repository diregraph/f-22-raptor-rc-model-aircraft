// Written by tools/nozzle-loads.mjs from site/js/nozzle-loads.js. Do not edit by hand: change the model and rerun.
// Largest main-fan thrust the cord servos (MG90S on 6 V, 70% of stall) can hold, as a fraction of
// full thrust (958 g), every 5 degrees of deflection from 0 to 100. Bearings with PTFE washers.
#pragma once
namespace nozzle {
static constexpr int LIMIT_N = 21;
static constexpr float LIMIT_STEP = 5.0f;
static constexpr float LIMIT_CAP[LIMIT_N] = {1.000f, 1.000f, 1.000f, 1.000f, 1.000f, 1.000f, 0.949f, 0.823f, 0.730f, 0.658f, 0.601f, 0.555f, 0.518f, 0.487f, 0.461f, 0.441f, 0.423f, 0.408f, 0.397f, 0.387f, 0.380f};
}
