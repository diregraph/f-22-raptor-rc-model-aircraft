-- Three-bearing swivel nozzle for ArduPilot (Lua scripting), the alternative to Nozzle3BSM.h if the flight controller
-- ends up running ArduPilot (docs/engineering/05-ardupilot-sitl-plan.md). Same maths as site/js/nozzle.js, checked
-- against it by tools/nozzle-firmware-test.mjs.
--
-- In:  the tilt ArduPilot asks for, read from the "Motor Tilt" servo function 41. Confirmed in SITL (ArduPlane 4.7.2):
--      0 = motor up (VTOL, jet straight down, 90 deg deflection), 1000 = fully forward (jet straight aft, 0 deg); past
--      90 deg is not something ArduPilot asks for, so braking to 100 deg needs a change there.
--      Yaw: in the hover the yaw demand is motors:get_yaw() (-1..1, + = nose right = swing +, confirmed in SITL); the
--      rudder function (4) carries only the fixed-wing yaw damper in Q modes, so it is used only outside VTOL flight.
-- Out: two pulses on the "Script 1" and "Script 2" servo functions (94, 95). Set SERVOn_FUNCTION of the two nozzle
--      servo outputs to 94 and 95, and leave 41 on an unused output so ArduPilot still computes it.
-- Flown in SITL against the sim.js physics (tools/sitl-run.py); untested on a vehicle.

local N = {}
local RAD = math.pi / 180
N.cfg = { alpha = 40, maxDeflection = 100, maxYaw = 20, band1 = 48.3, ring = 50.0, collar = 53.4, drum = 27.5,
          halfTravel = 85, usPerDeg = 1000 / 90, trim = { 0, 0 }, dir = { 1, 1 }, backlash = { 0, 0 },
          deflRate = 150, yawRate = 300, guardDeg = 35, guardFull = 6, guardOff = 17, startRate = 30, rigDeflection = 45 }

local function clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi end return v end

local function rotv(k, t, v)   -- Rodrigues rotation of v about unit axis k by t radians
  local c, s = math.cos(t), math.sin(t)
  local d = k[1] * v[1] + k[2] * v[2] + k[3] * v[3]
  local x, y, z = k[2] * v[3] - k[3] * v[2], k[3] * v[1] - k[1] * v[3], k[1] * v[2] - k[2] * v[1]
  return { v[1] * c + x * s + k[1] * d * (1 - c), v[2] * c + y * s + k[2] * d * (1 - c), v[3] * c + z * s + k[3] * d * (1 - c) }
end

function N.yawLimit(d) return N.cfg.maxYaw - math.max(0, d - 90) * 1.2 end

function N.solve(deflection, yaw)   -- deflection and yaw (degrees) -> joint angles a, b, c
  local cfg = N.cfg
  local d, sa = clamp(deflection, 0, cfg.maxDeflection), math.sin(cfg.alpha * RAD)
  local b = 2 * math.asin(math.min(1, math.sin(d * RAD / 4) / sa)) / RAD
  local bz = math.max(b, 0.5)
  local n2 = { math.cos(cfg.alpha * RAD), math.sin(cfg.alpha * RAD), 0 }
  local n3 = { math.cos(cfg.alpha * RAD), -math.sin(cfg.alpha * RAD), 0 }
  local e = rotv(n2, bz * RAD, rotv(n3, -bz * RAD, { 1, 0, 0 }))
  local az, yl = math.atan(e[3], -e[2]) / RAD, N.yawLimit(d)
  return az - clamp(yaw, -yl, yl), b, -b
end

-- Mid-travel of each pulley over every pose. Done a slice at a time: all 303 solves in one go exceed ArduPilot's
-- per-call instruction limit (seen in SITL: "exceeded time limit"), so the vehicle loop spreads it over its first calls.
local centreBand, centreRing
local scan = { d = 0, bl = 1e9, bh = -1e9, rl = 1e9, rh = -1e9 }
local function findCentres(slice)
  local k = N.cfg.collar / N.cfg.ring
  local last = math.min(scan.d + slice - 1, N.cfg.maxDeflection)
  for d = scan.d, last do
    for y = -1, 1 do
      local a, b = N.solve(d, y * N.yawLimit(d))
      local ring = a + k * b
      scan.bl, scan.bh, scan.rl, scan.rh = math.min(scan.bl, a), math.max(scan.bh, a), math.min(scan.rl, ring), math.max(scan.rh, ring)
    end
  end
  scan.d = last + 1
  if scan.d > N.cfg.maxDeflection then centreBand, centreRing = (scan.bl + scan.bh) / 2, (scan.rl + scan.rh) / 2 end
  return centreBand ~= nil
end
function N.centres() return centreBand, centreRing end

function N.servoAngles(a, b)   -- joint angles -> degrees from each servo's centre
  local cfg = N.cfg
  return (a - centreBand) * cfg.band1 / cfg.drum, (a + cfg.collar / cfg.ring * b - centreRing) * cfg.ring / cfg.drum
end

-- controller state, as in Nozzle3BSM.h
local st = { defl = nil, yaw = 0, started = false, lastWant = 90, prev = { 0, 0 }, sign = { 1, 1 } }
function N.reset() st = { defl = nil, yaw = 0, started = false, lastWant = 90, prev = { 0, 0 }, sign = { 1, 1 } } end

function N.update(dt, want, wantYaw, airspeed, onGround, linkOk)
  local cfg = N.cfg
  if not linkOk then want, wantYaw = st.lastWant, 0 end
  st.lastWant = want
  local s = clamp((airspeed - cfg.guardFull) / (cfg.guardOff - cfg.guardFull), 0, 1)
  local guard = onGround and 0 or cfg.guardDeg * (1 - s * s * (3 - 2 * s))
  local target = clamp(math.max(want, guard), 0, cfg.maxDeflection)
  if st.defl == nil then st.defl = cfg.rigDeflection end
  local rate = st.started and cfg.deflRate or cfg.startRate
  st.defl = st.defl + clamp(target - st.defl, -rate * dt, rate * dt)
  local yl = N.yawLimit(st.defl)
  st.yaw = clamp(st.yaw + clamp(clamp(wantYaw, -yl, yl) - st.yaw, -cfg.yawRate * dt, cfg.yawRate * dt), -yl, yl)
  if math.abs(target - st.defl) < 0.5 then st.started = true end
  local s1, s2 = N.servoAngles(N.solve(st.defl, st.yaw))
  local sd, us = { s1, s2 }, {}
  for i = 1, 2 do
    local dv = sd[i] - st.prev[i]
    if math.abs(dv) > 0.05 then st.sign[i] = dv > 0 and 1 or -1 end
    st.prev[i] = sd[i]
    local cmd = clamp(sd[i] + st.sign[i] * cfg.backlash[i] * 0.5, -cfg.halfTravel, cfg.halfTravel)
    us[i] = math.floor(clamp(1500 + cfg.dir[i] * cmd * cfg.usPerDeg + cfg.trim[i], 500, 2500) + 0.5)
  end
  return us[1], us[2], st.defl, st.yaw, target > want + 0.01
end

-- On the vehicle: run every 10 ms. In the test harness SRV_Channels does not exist and the module is returned instead.
if SRV_Channels == nil then findCentres(N.cfg.maxDeflection + 1) return N end

local K_TILT, K_RUDDER, K_OUT1, K_OUT2, PERIOD = 41, 4, 94, 95, 10
local function loop()
  if centreBand == nil then findCentres(10) return loop, PERIOD end   -- about 11 calls, 0.1 s after boot
  local tilt = SRV_Channels:get_output_scaled(K_TILT) or 0
  local yaw
  if quadplane:in_vtol_mode() or quadplane:in_assisted_flight() then
    yaw = motors:get_yaw() * N.cfg.maxYaw
  else
    yaw = (SRV_Channels:get_output_scaled(K_RUDDER) or 0) / 4500 * N.cfg.maxYaw
  end
  local aspd = ahrs:airspeed_estimate() or 0
  local flying = vehicle:get_likely_flying()
  local u1, u2 = N.update(PERIOD / 1000, (1000 - tilt) * 90 / 1000, yaw, aspd, not flying, rc:has_valid_input())
  SRV_Channels:set_output_pwm(K_OUT1, u1)
  SRV_Channels:set_output_pwm(K_OUT2, u2)
  return loop, PERIOD
end
gcs:send_text(6, "3BSM nozzle script running")
return loop, PERIOD
