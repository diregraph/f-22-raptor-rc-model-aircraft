"""Fly one scenario with real ArduPilot (SITL) in charge of the sim.js physics, and save the flight for the site.

    python3 tools/sitl-run.py hover            # or: mission, gust, weak-roll-motor, all
    python3 tools/sitl-run.py hover --speedup 4 --ardupilot ~/ardupilot

Needs an ArduPlane SITL build (./waf configure --board sitl && ./waf plane in an ArduPilot checkout, Plane-4.7.2)
and pymavlink. Starts tools/sitl-bridge.mjs and the autopilot, loads ardupilot/f35b.parm + sitl.parm and the Lua
scripts, flies the scenario, and writes site/analysis/sitl/<scenario>.json: the physics at 20 samples a second
(position, attitude, each fan's thrust, nozzle, tails, legs) with ArduPilot's flight mode and its demanded attitude.
"""
import argparse, json, math, os, shutil, signal, socket, subprocess, sys, tempfile, time
from pymavlink import mavutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AP = os.path.join(ROOT, 'ardupilot')
OUT = os.path.join(ROOT, 'site', 'analysis', 'sitl')


class Flight:
    def __init__(self, ardupilot, speedup):
        self.dir = tempfile.mkdtemp(prefix='f35b-sitl-')
        os.symlink(os.path.join(AP, 'scripts'), os.path.join(self.dir, 'scripts'))
        self.log = os.path.join(self.dir, 'physics.jsonl')
        self.ctl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.bridge = subprocess.Popen(['node', os.path.join(ROOT, 'tools', 'sitl-bridge.mjs'), '--log', self.log],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        time.sleep(0.5)
        binary = os.path.join(os.path.expanduser(ardupilot), 'build', 'sitl', 'bin', 'arduplane')
        self.ap = subprocess.Popen([binary, '--model', 'JSON:127.0.0.1', '--speedup', str(speedup), '-I0',
                                    '--defaults', os.path.join(AP, 'f35b.parm') + ',' + os.path.join(AP, 'sitl.parm')],
                                   cwd=self.dir, stdout=open(os.path.join(self.dir, 'sitl.log'), 'w'), stderr=subprocess.STDOUT)
        self.speedup = speedup
        self.m = mavutil.mavlink_connection('tcp:127.0.0.1:5760', source_system=255, retries=30)
        self.m.wait_heartbeat(timeout=30)
        self.m.mav.request_data_stream_send(self.m.target_system, self.m.target_component, mavutil.mavlink.MAV_DATA_STREAM_ALL, 10, 1)
        self.events, self.samples, self.last = [], [], {}
        self.stick()

    # sticks: -1..1 for roll/pitch/yaw, 0..1 throttle (0.5 = hold height in the Q modes)
    def stick(self, thr=0.0, roll=0.0, pitch=0.0, yaw=0.0):
        rc = {'rc_%d' % i: 1500 for i in range(1, 13)}
        rc.update(rc_1=int(1500 + 500 * roll), rc_2=int(1500 + 500 * pitch), rc_3=int(1000 + 1000 * thr), rc_4=int(1500 + 500 * yaw), rc_5=1000)
        self.send(rc=rc)

    def send(self, **msg):
        self.ctl.sendto(json.dumps(msg).encode(), ('127.0.0.1', 9003))

    def pump(self, seconds):
        """read telemetry for this many simulated seconds"""
        end = time.time() + seconds / self.speedup
        while time.time() < end:
            x = self.m.recv_match(blocking=True, timeout=0.2)
            if x is None:
                continue
            t = x.get_type()
            if t == 'STATUSTEXT':
                self.events.append({'t': self.boot_s(), 'text': x.text})
                print('  ap:', x.text)
            elif t == 'HEARTBEAT' and x.get_srcSystem() == self.m.target_system and x.type != mavutil.mavlink.MAV_TYPE_GCS:
                mode = self.m.flightmode
                if self.last.get('mode') != mode:
                    self.events.append({'t': self.boot_s(), 'mode': mode}); print('  mode', mode)
                self.last['mode'] = mode
            elif t in ('ATTITUDE', 'NAV_CONTROLLER_OUTPUT', 'VFR_HUD', 'SYSTEM_TIME'):
                self.last[t] = x
                if t == 'ATTITUDE' and 'NAV_CONTROLLER_OUTPUT' in self.last:
                    n = self.last['NAV_CONTROLLER_OUTPUT']
                    self.samples.append({'t': round(x.time_boot_ms / 1000, 2), 'mode': self.last.get('mode'),
                                         'roll': round(math.degrees(x.roll), 1), 'pitch': round(math.degrees(x.pitch), 1),
                                         'yaw': round(math.degrees(x.yaw), 1), 'navRoll': round(n.nav_roll, 1), 'navPitch': round(n.nav_pitch, 1)})

    def boot_s(self):
        a = self.last.get('ATTITUDE')
        return round(a.time_boot_ms / 1000, 2) if a else 0

    def mode(self, name):
        for _ in range(20):
            self.m.set_mode(name); self.pump(1)
            if self.m.flightmode == name:
                return
        raise RuntimeError('could not enter ' + name)

    def arm(self):
        for _ in range(40):
            self.m.arducopter_arm(); self.pump(2)
            if self.m.motors_armed():
                return
        raise RuntimeError('would not arm')

    def mission(self, items):
        """items: (command, p1, p2, p3, p4, north_m, east_m, alt_m) relative to home"""
        home = self.m.location()
        lat0, lon0 = home.lat, home.lng
        self.m.waypoint_clear_all_send(); self.pump(1)
        cmds = [(mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, 0, 0, 0)] + items   # item 0 is home
        self.m.waypoint_count_send(len(cmds))
        for _ in range(len(cmds)):
            req = self.m.recv_match(type=['MISSION_REQUEST', 'MISSION_REQUEST_INT'], blocking=True, timeout=10)
            c, p1, p2, p3, p4, n, e, alt = cmds[req.seq]
            lat = lat0 + n / 111319.5
            lon = lon0 + e / (111319.5 * math.cos(math.radians(lat0)))
            self.m.mav.mission_item_int_send(self.m.target_system, self.m.target_component, req.seq,
                                             mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, c, 0, 1, p1, p2, p3, p4,
                                             int(lat * 1e7), int(lon * 1e7), alt)
        ack = self.m.recv_match(type='MISSION_ACK', blocking=True, timeout=10)
        print('  mission uploaded,', len(cmds), 'items, ack', ack.type if ack else None)

    def close(self, name):
        for p in (self.ap, self.bridge):
            p.send_signal(signal.SIGINT)
        time.sleep(1)
        for p in (self.ap, self.bridge):
            p.kill()
        phys = [json.loads(l) for l in open(self.log) if l.strip()]
        os.makedirs(OUT, exist_ok=True)
        out = {'scenario': name, 'firmware': 'ArduPlane 4.7.2 SITL', 'params': 'ardupilot/f35b.parm',
               'fields': {'p': 'position m, twin axes (x north, y up, z east)', 'q': 'attitude quaternion x y z w, twin axes',
                          'T': 'thrust N: lift fan, main fan, roll left, roll right', 'tilt': 'nozzle deflection deg (90 = down)',
                          'nozzle': 'nozzle side swing deg', 'tailL/tailR': 'tail angles deg', 'gear': '0 down .. 1 up'},
               'physics': phys, 'autopilot': self.samples, 'events': self.events}
        path = os.path.join(OUT, name + '.json')
        json.dump(out, open(path, 'w'), separators=(',', ':'))
        print('wrote', os.path.relpath(path, ROOT), len(phys), 'physics samples,', len(self.samples), 'autopilot samples')
        shutil.rmtree(self.dir, ignore_errors=True)
        return out


def hover(f):
    f.mode('QLOITER'); f.arm()
    f.stick(thr=0.8); f.pump(3)
    f.stick(thr=0.5); f.pump(60)
    f.stick(thr=0.5, yaw=0.4); f.pump(3)                  # quarter turn to the right
    f.stick(thr=0.5); f.pump(10)
    f.mode('QLAND'); f.pump(25)


def gust(f):
    f.mode('QLOITER'); f.arm()
    f.stick(thr=0.8); f.pump(3); f.stick(thr=0.5); f.pump(15)
    f.send(wind=[3, 0, 0]); f.pump(15)                     # steady 3 m/s from the south
    f.send(wind=[3, 5, 0]); f.pump(2)                      # 5 m/s side gust for 2 s
    f.send(wind=[3, 0, 0]); f.pump(15)
    f.send(wind=[0, 0, 0]); f.mode('QLAND'); f.pump(25)


def weak_roll_motor(f):
    f.mode('QLOITER'); f.arm()
    f.stick(thr=0.8); f.pump(3); f.stick(thr=0.5); f.pump(15)
    f.send(thrustScale=[1, 1, 0.7, 1]); f.pump(20)         # left roll fan drops to 70% thrust
    f.mode('QLAND'); f.pump(25)


def mission(f):
    C = mavutil.mavlink
    f.mission([(C.MAV_CMD_NAV_VTOL_TAKEOFF, 0, 0, 0, 0, 0, 0, 15),
               (C.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, 250, 0, 25),
               (C.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, 250, 150, 25),
               (C.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, -50, 150, 25),
               (C.MAV_CMD_NAV_VTOL_LAND, 0, 0, 0, 0, 0, 0, 0)])
    f.mode('AUTO'); f.arm(); f.stick(thr=0.5)
    for _ in range(200):
        f.pump(1)
        if not f.m.motors_armed():
            break


SCENARIOS = {'hover': hover, 'mission': mission, 'gust': gust, 'weak-roll-motor': weak_roll_motor}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scenario', choices=list(SCENARIOS) + ['all'])
    ap.add_argument('--speedup', type=float, default=4)
    ap.add_argument('--ardupilot', default=os.environ.get('ARDUPILOT', '~/ardupilot'))
    a = ap.parse_args()
    for name in (SCENARIOS if a.scenario == 'all' else [a.scenario]):
        print('==', name)
        f = Flight(a.ardupilot, a.speedup)
        try:
            SCENARIOS[name](f)
        finally:
            f.close(name)
