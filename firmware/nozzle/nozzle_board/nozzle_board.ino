// Nozzle board: Waveshare RP2040-Zero, two DRV8833 motor drivers, three N20 6 V 100:1 gearmotors with magnetic encoders.
// Arduino IDE with the Raspberry Pi Pico core (arduino-pico, Earle Philhower). The controller itself is ../Nozzle3BSM.h,
// checked on a PC by tools/nozzle-firmware-test.mjs; this file only does the pins. Not yet built or run on hardware.
//
// Wiring (docs/ducted-propulsion.md, "Nozzle board"):
//   GP26  deflection pulse from the flight controller (SERVO10, function 94)    GP27  yaw pulse (SERVO11, function 95)
//   GP0/1 joint-1 encoder A/B    GP2/3 joint-2 encoder A/B    GP4/5 joint-3 encoder A/B   (encoders on 3.3 V)
//   GP6/7 driver 1 AIN1/AIN2 -> joint-1 motor    GP8/9 driver 1 BIN1/BIN2 -> joint 2    GP10/11 driver 2 AIN1/AIN2 -> joint 3
//   Driver VM and the board's 5 V pin from the 6 V servo rail; nSLEEP pulled high on both drivers.
#include "Nozzle3BSM.h"          // a link to ../Nozzle3BSM.h; copy the file here if your system does not keep links

static const uint8_t PIN_IN[2] = {26, 27};
static const uint8_t PIN_ENC[3][2] = {{0, 1}, {2, 3}, {4, 5}};
static const uint8_t PIN_MOT[3][2] = {{6, 7}, {8, 9}, {10, 11}};
static const int PWM_RANGE = 1000;

static nozzle::Nozzle nz;
static volatile int32_t counts[3];
static volatile uint32_t rise[2], width[2], lastEdge[2];

static void encoder(int i) {   // full quadrature: count both edges of both channels
  static uint8_t prev[3];
  uint8_t s = (digitalRead(PIN_ENC[i][0]) << 1) | digitalRead(PIN_ENC[i][1]);
  static const int8_t step[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  counts[i] += step[(prev[i] << 2) | s]; prev[i] = s;
}
static void enc0() { encoder(0); } static void enc1() { encoder(1); } static void enc2() { encoder(2); }
static void pulse(int i) {
  uint32_t t = micros();
  if (digitalRead(PIN_IN[i])) rise[i] = t; else { width[i] = t - rise[i]; lastEdge[i] = t; }
}
static void in0() { pulse(0); } static void in1() { pulse(1); }

static void drive(int i, float duty) {   // slow decay: one input high, PWM on the other; speed follows duty closely
  int d = (int)(fabsf(duty) * PWM_RANGE + 0.5f), a = PIN_MOT[i][0], b = PIN_MOT[i][1];
  if (d == 0) { analogWrite(a, PWM_RANGE); analogWrite(b, PWM_RANGE); return; }   // brake: holds better than coasting
  if (duty > 0) { analogWrite(a, PWM_RANGE); analogWrite(b, PWM_RANGE - d); }
  else { analogWrite(a, PWM_RANGE - d); analogWrite(b, PWM_RANGE); }
}

void setup() {
  Serial.begin(115200);
  analogWriteFreq(20000); analogWriteRange(PWM_RANGE);
  for (auto& m : PIN_MOT) for (uint8_t p : m) { pinMode(p, OUTPUT); analogWrite(p, PWM_RANGE); }
  void (*encIsr[3])() = {enc0, enc1, enc2};
  for (int i = 0; i < 3; i++) for (uint8_t p : PIN_ENC[i]) { pinMode(p, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(p), encIsr[i], CHANGE); }
  pinMode(PIN_IN[0], INPUT); pinMode(PIN_IN[1], INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_IN[0]), in0, CHANGE); attachInterrupt(digitalPinToInterrupt(PIN_IN[1]), in1, CHANGE);
}

void loop() {
  static uint32_t last = micros(), lastPrint = 0;
  uint32_t now = micros();
  if (now - last < 1000) return;                       // 1 kHz
  float dt = (now - last) * 1e-6f; last = now;
  int32_t c[3]; uint16_t us[2];
  noInterrupts();
  for (int i = 0; i < 3; i++) c[i] = counts[i];
  for (int i = 0; i < 2; i++) us[i] = now - lastEdge[i] < 60000 ? (uint16_t)width[i] : 0;   // no pulse for 60 ms: none
  interrupts();
  nozzle::Output o = nz.update(dt, us[0], us[1], c);
  for (int i = 0; i < 3; i++) drive(i, o.duty[i]);
  if (now - lastPrint > 200000) {                      // 5 Hz status on USB, for the bench steps
    lastPrint = now;
    Serial.printf("state %d sig %d defl %.1f yaw %.1f | q %.2f %.2f %.2f | duty %.2f %.2f %.2f\n", o.state, o.signalOk, o.deflection, o.yaw,
                  o.q[0], o.q[1], o.q[2], o.duty[0], o.duty[1], o.duty[2]);
  }
}
