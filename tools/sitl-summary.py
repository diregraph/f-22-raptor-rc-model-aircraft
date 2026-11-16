"""Score recorded ArduPilot SITL flights against the requirements: python3 tools/sitl-summary.py [scenario ...]
Reads site/analysis/sitl/<scenario>.json, prints the numbers and writes site/analysis/sitl/summary.json."""
import json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'site', 'analysis', 'sitl')
MAX_N = [13.18, 9.40, 8.07, 8.07]          # full thrust per fan (sim.js THRUSTERS), N


def heading(q):
    x, y, z, w = q
    return -math.degrees(math.atan2(-2 * (x * z - y * w), 1 - 2 * (y * y + z * z)))   # compass sense, nose right = +


def attitude(q):
    x, y, z, w = q
    up_y = 1 - 2 * (x * x + z * z)
    fy = 2 * (x * y + z * w)
    ry = 2 * (y * z - x * w)
    return math.degrees(math.atan2(-ry, up_y)), math.degrees(math.asin(max(-1, min(1, fy))))


def score(name):
    d = json.load(open(os.path.join(DIR, name + '.json')))
    P = d['physics']
    air = [r for r in P if r['p'][1] > 0.5]
    if not air:
        return {'scenario': name, 'flew': False}
    t0, t1 = air[0]['t'], air[-1]['t']
    load = [max(r['T'][i] / MAX_N[i] for i in range(4)) for r in air if r['tilt'] > 60]
    out = {'scenario': name, 'flew': True, 'airborne_s': round(t1 - t0, 1),
           'max_height_m': round(max(r['p'][1] for r in air), 1),
           'max_speed_ms': round(max(math.hypot(r['v'][0], r['v'][2]) for r in air), 1),
           'max_roll_deg': round(max(abs(attitude(r['q'])[0]) for r in air), 1),
           'max_pitch_deg': round(max(abs(attitude(r['q'])[1]) for r in air), 1),
           'hover_fan_load_mean_pct': round(100 * sum(load) / len(load), 1) if load else None,
           'hover_fan_load_peak_pct': round(100 * max(load), 1) if load else None,
           'landed': P[-1]['p'][1] < 0.3}
    # steady hover window: 10 s after take-off to 60 s, for the position-hold scenarios
    hold = [r for r in air if t0 + 10 <= r['t'] <= t0 + 60 and r['tilt'] > 80]
    if hold and name != 'mission':
        hs = [r['p'][1] for r in hold]
        x0, z0 = hold[0]['p'][0], hold[0]['p'][2]
        out['hold_height_band_m'] = round(max(hs) - min(hs), 2)
        out['hold_drift_m'] = round(max(math.hypot(r['p'][0] - x0, r['p'][2] - z0) for r in hold), 2)
        hd = [heading(r['q']) for r in hold]
        out['hold_heading_band_deg'] = round(max(hd) - min(hd), 1)
        out['hold_nozzle_swing_deg'] = round(sum(abs(r['nozzle']) for r in hold) / len(hold), 1)
    if name == 'mission':
        fw = [r for r in air if r['tilt'] < 5]
        out['forward_flight_s'] = round(len(fw) / 20, 1)
        out['max_airspeed_ms'] = out['max_speed_ms']
        hs = [r['p'][1] for r in air]
        out['min_height_after_climb_m'] = round(min(r['p'][1] for r in air if r['t'] > t0 + 20 and r['t'] < t1 - 30), 1) if t1 - t0 > 60 else None
        out['modes'] = [e['mode'] for e in d['events'] if 'mode' in e]
    return out


if __name__ == '__main__':
    names = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(DIR) if f.endswith('.json') and f != 'summary.json')
    res = {n: score(n) for n in names}
    path = os.path.join(DIR, 'summary.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(res)
    json.dump(old, open(path, 'w'), indent=1)
    for n, r in res.items():
        print(n, json.dumps(r))
