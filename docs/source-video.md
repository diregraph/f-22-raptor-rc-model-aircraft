# Source video: reconstructed description

Reconstructed from two screen recordings of the YouTube app (description panel,
chapter list, auto-generated transcript). The transcript is auto-captioned and
auto-dubbed, so product names were garbled; corrections are marked *(interpreted)*.

## Video

| Field | Value |
|---|---|
| Title | This RC F-35 Shouldn't Be Possible... But It Is |
| Channel | Jay Kujan (@Jays_rcgarage), 1.1 M subscribers |
| Published | 15 Nov 2025 |
| Length | 12:14 |
| Views / likes | 384,932 / ~12.5k |
| Builder | Eric Maglio (@ericmaglio), Lofted Aero |
| Links in description | loftedaero.com, direct F-35B product link, Instagram lofted.aero |

## Description text (as shown)

> This is a fully functional VTOL RC F-35 that actually transitions completely.
> It exists because Eric from LoftedAero built it entirely from scratch. Every
> element of this aircraft was designed, engineered, and assembled by him. No
> kit. No blueprint. Just pure skill and innovation.
>
> Eric blended traditional foam construction with precision 3D-printed
> components. The thrust-vectoring nozzle and other key airframe parts were
> printed using Bambu Lab machines.. specifically the X1 Carbon and the H2S...
> along with Bambu's own filament to maintain consistency, strength, and tight
> tolerances. Soon, he'll be releasing printer-specific RC aircraft models
> optimized for the X1C, H2S, and the wider Bambu ecosystem.
>
> But the real magic is the control system: Eric developed a custom transition
> module that sequences the servos and manages the entire VTOL process. It
> allows this F-35 to move from hover → forward flight → hover with smooth,
> reliable transitions — something almost no RC model in the world can do.
>
> Huge credit to Eric and LoftedAero for pushing RC aviation into the future.

The rest of the description is Bambu Lab affiliate links and search keywords.

## Chapters

| Time | Chapter |
|---|---|
| 0:00 | Introduction to project |
| 0:36 | Design and portability |
| 1:23 | Wing tip motor mechanics |
| 3:53 | Tail control surfaces |
| 4:34 | Vectoring nozzle mechanics |
| 5:29 | Flight control system |
| 7:55 | Electronics and power |
| 9:29 | Flight demonstration |

## Specifications stated in the video

| Item | Value | Timestamp |
|---|---|---|
| Wingspan | 30.5 in (775 mm) | 10:35 |
| Wing area | 2.43 sq ft (0.226 m²) | 10:35 |
| Weight | about 6 lb (2.7 kg) | 10:44 |
| Main fans | 2 × FMS 70 mm 12-blade ducted fans (rear with nozzle + front lift fan) | 0:00, 8:48, 10:53 |
| Roll motors | 2 × EMAX *(interpreted from "EMAC")* micro quadcopter motors, 2 in propellers, at the wing tips | 8:57 |
| Speed controllers | FMS Predator *(model suffix unclear)*, "a couple" | 8:12, 11:08 |
| Battery | 6-cell 4000 mAh Admiral Pro | 8:48 |
| Power at vertical take-off | about 3,300 W | 11:08 |
| Flight controller | Matek board *(interpreted from "mate board")* running ArduPilot *(interpreted from "Argu/RG/RJ Pilot")* | 6:32, 8:12 |
| GPS | Mounted above the nose gear | 8:32 |
| Nozzle servos | 3 × Hitec multi-turn servos with position tracking, probably CAN bus *(interpreted from "canvas servos")* | 4:58–5:13 |
| Flight time | 3–3.5 min including vertical take-off and landing; about 2.5 min hover only | 9:05–9:22 |
| Landing gear | Retractable, folds into side wells | 7:48–8:05 |

## How it works

**Layout.** Two 70 mm fans produce the bulk of vertical thrust. Two wing-tip
motors do roll control only. Yaw in hover comes from rotating the nozzle left
and right, not from differential motor torque (7:10–7:34).

**Why wing-tip motors instead of scale bleed-air roll posts.** The real F-35B
ducts compressor bleed air to the wing tips. A model fan does not compress air,
so ducting it far loses a lot of thrust, and tapping 10–20% of main-fan flow
also cuts main thrust. Separate small motors avoid both losses (1:50–3:22).

**Control surfaces.** Tail surfaces only, no ailerons. This keeps the removable
wings free of servo wiring and linkages. The F-35 tail spans about two thirds
of the wing, so authority is sufficient (4:01–4:34).

**Nozzle (three-bearing swivel module).** Three pivoting ring-gear sections,
each driven by a servo underneath. A custom board with custom software takes
two inputs from the flight controller (tilt and rudder) and computes the three
ring angles (5:13–5:31). The nozzle travels to 90° for vertical lift and on to
105°, so the aircraft can stay level and vector thrust forward or backward for
position holding (5:31–6:32).

**Flight software.** ArduPilot does not support this configuration natively.
Two changes were made: nozzle-based position control that also works backward,
and a custom motor layout. Transitions, GPS position hold and return-to-home
are otherwise stock ArduPilot VTOL features (6:32–7:55).

**Portability.** Wings and tail are removable, held on with screws; wing-tip
motors use electrical connectors under the wing. An earlier 90 mm version had
fixed wings and tail (0:40–1:37).

**Construction.** Foam airframe with 3D-printed nozzle and key parts, printed
on Bambu Lab X1 Carbon and H2S.

## Not stated in the recordings

Lift fan motor details, ESC current rating, servo part numbers, flight
controller model, filament type, foam type and thickness, and file pricing.
