-- Three-bearing swivel nozzle: the flight-controller half, for ArduPilot (Lua scripting).
-- The nozzle has a small board of its own (NozzleBoard.h, nozzle_board/): it homes the three joint gearmotors and turns
-- deflection and yaw into joint angles. This script only decides what deflection and yaw to ask for, and sends them.
--
-- In:  the tilt ArduPilot asks for, read from the "Motor Tilt" servo function 41. Confirmed in SITL (ArduPlane 4.7.2):
--      0 = motor up (VTOL, jet straight down, 90 deg deflection), 1000 = fully forward (jet straight aft, 0 deg); past
--      90 deg is not something ArduPilot asks for, so braking to 100 deg needs a change there.
--      Yaw: in the hover the yaw demand is motors:get_yaw() (-1..1, + = nose right = swing +, confirmed in SITL); the
--      rudder function (4) carries only the fixed-wing yaw damper in Q modes, so it is used only outside VTOL flight.
-- Out: two pulses on the "Script 1" and "Script 2" servo functions (94, 95), wired to the nozzle board:
--      deflection 0..100 deg = 1000..2000 us, yaw swing -20..+20 deg = 1000..2000 us.
--      Set SERVOn_FUNCTION of those two outputs to 94 and 95, and leave 41 on an unused output so ArduPilot still computes it.
-- Flown in SITL against the sim.js physics (tools/sitl-run.py); untested on a vehicle.

local N = {}
N.cfg = { maxDeflection = 100, maxYaw = 20, deflRate = 150, yawRate = 100,     -- yawRate: site/js/sim.js nozzleRate
          guardDeg = 35, guardFull = 6, guardOff = 17 }

local function clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi end return v end

-- past 90 degrees the yaw swing tapers from 20 to 8 degrees to clear the tail booms (yawLimit() in site/js/nozzle.js)
function N.yawLimit(d) return N.cfg.maxYaw - math.max(0, d - 90) * 1.2 end

-- pulse widths the nozzle board reads (NozzleBoard.h decodes them the same way)
function N.pulses(defl, yaw)
  return math.floor(1000 + clamp(defl, 0, 100) * 10 + 0.5), math.floor(1500 + clamp(yaw, -20, 20) * 25 + 0.5)
end

local st = { defl = nil, yaw = 0, lastWant = 90 }
function N.reset() st = { defl = nil, yaw = 0, lastWant = 90 } end

function N.update(dt, want, wantYaw, airspeed, onGround, linkOk)
  local cfg = N.cfg
  if not linkOk then want, wantYaw = st.lastWant, 0 end                -- radio lost: hold the deflection, centre the yaw
  st.lastWant = want
  -- hover guard: slow and airborne, nothing aft of the balance point holds the tail up unless the jet is bent down
  local s = clamp((airspeed - cfg.guardFull) / (cfg.guardOff - cfg.guardFull), 0, 1)
  local guard = onGround and 0 or cfg.guardDeg * (1 - s * s * (3 - 2 * s))
  local target = clamp(math.max(want, guard), 0, cfg.maxDeflection)
  if st.defl == nil then st.defl = target end
  st.defl = st.defl + clamp(target - st.defl, -cfg.deflRate * dt, cfg.deflRate * dt)
  local yl = N.yawLimit(st.defl)
  st.yaw = clamp(st.yaw + clamp(clamp(wantYaw, -yl, yl) - st.yaw, -cfg.yawRate * dt, cfg.yawRate * dt), -yl, yl)
  local u1, u2 = N.pulses(st.defl, st.yaw)
  return u1, u2, st.defl, st.yaw, target > want + 0.01
end

-- On the vehicle: run every 10 ms. In the test harness SRV_Channels does not exist and the module is returned instead.
if SRV_Channels == nil then return N end

local K_TILT, K_RUDDER, K_OUT1, K_OUT2, PERIOD = 41, 4, 94, 95, 10
local function loop()
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
