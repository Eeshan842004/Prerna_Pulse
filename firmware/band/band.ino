/*
 * Prerana Pulse band firmware v2 (ESP32-C3 + 0.96" OLED), band-only.
 *
 * STATUS: WRITTEN BUT NOT COMPILED OR TESTED ON HARDWARE. No band hardware was available.
 * The same logic runs in the virtual band (web/js/band.js), which IS tested end to end against
 * the server. Packet and receipt formats match backend/app/protocol.py byte for byte.
 *
 * What it does
 *   - Learns this child's resting heart rate while she sits still, for three times of day.
 *   - Asks ONLY when all are true: heart rate >= 20% above HER normal for this time of day,
 *     for 2 minutes, still for 5 minutes, not in PT mode or a PT period, fewer than 3
 *     questions today, sensing not paused. A vibration only she feels, then "How are you?".
 *   - One button:  tap = next   hold 1 s = choose   double tap (idle) = open the menu
 *                  hold 5 s = SOS (then tap to confirm)   hold 2 s within 60 s = cancel SOS
 *   - Menu: the model's suggestion first (marked with a star), then the feelings, Talk to
 *     someone, PT mode, I'm in danger. The child always confirms; the model only orders it.
 *     Difficult feelings start a matching 1-minute exercise guided by vibration.
 *   - Every message is 19 bytes: ver | rotating id | counter | AES-CCM(type, arg) | tag,
 *     advertised over Bluetooth LE until a gateway writes back a receipt signed with this
 *     band's key. One buzz = the school has it. Two buzzes = not yet, still trying.
 *   - A receipt with status 2 means a message from an adult is waiting; a gateway writes it
 *     to the inbox characteristic (max 60 characters). Hold the button to say "Okay".
 *   - During an SOS the band sends a beacon every 5 s so gateways can report signal strength.
 *   - The per-child model, the school prior and the day's timetable are written by a gateway
 *     (model and timetable characteristics) and scored ON the band.
 *
 * The OLED shows English only; Devanagari needs a bitmap font (see README.md).
 *
 * Board: ESP32-C3 SuperMini (or any ESP32-C3/S3). Arduino core 3.x.
 * Libraries: NimBLE-Arduino 1.4.x, SparkFun MAX3010x, U8g2 (SSD1306).
 * Parts and wiring: see README.md in this folder.
 */
#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <NimBLEDevice.h>
#include <U8g2lib.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "mbedtls/ccm.h"
#include "mbedtls/md.h"

// ------------------------------------------------------------------ pins and constants
#define PIN_BUTTON   3      // to GND, internal pull-up
#define PIN_MOTOR    4      // via an NPN transistor / MOSFET + flyback diode
#define PIN_SDA      8
#define PIN_SCL      9
#define PIN_BATT     0      // battery through a 100k/100k divider

static const uint16_t COMPANY_ID = 0xFFFF;   // Bluetooth SIG test ID; a product registers its own
static const char *SVC_UUID     = "7f1c0001-5a1e-4f7b-9e3a-70726572616e";
static const char *RECEIPT_UUID = "7f1c0002-5a1e-4f7b-9e3a-70726572616e";
static const char *TIME_UUID    = "7f1c0003-5a1e-4f7b-9e3a-70726572616e";   // gateway time beacon after a power loss
static const char *INBOX_UUID   = "7f1c0004-5a1e-4f7b-9e3a-70726572616e";   // [id, len, text...] from an adult
static const char *MODEL_UUID   = "7f1c0005-5a1e-4f7b-9e3a-70726572616e";   // child + school Naive Bayes counts
static const char *TT_UUID      = "7f1c0006-5a1e-4f7b-9e3a-70726572616e";   // today's timetable
static const uint8_t VERSION = 1;            // envelope version (unchanged)
static const uint32_t EPOCH_SECONDS = 900;
static const int32_t TZ_SECONDS = 19800;     // Asia/Kolkata

// Message types (backend/app/protocol.py)
enum MsgType : uint8_t { T_FEELING = 1, T_SKIPPED = 2, T_TALK = 3, T_SOS = 4, T_CANCEL = 5, T_STATUS = 6, T_BATTERY = 7,
                         T_PAUSE = 8, T_SEEN = 9, T_EXERCISE = 10, T_SUGGESTION = 11 };

// Timing
static const uint32_t STILL_MS = 300000, NOTICE_MS = 120000, ASK_WINDOW_MS = 60000, REASK_MS = 600000, COOLDOWN_MS = 45UL * 60000;
static const uint32_t LEARN_SAMPLES = 3UL * 6 * 60 * 6;  // about 3 school days of 10-second still samples per time of day
static const uint32_t HOLD_CHOOSE_MS = 1000, HOLD_SOS_MS = 5000, CONFIRM_MS = 10000, CANCEL_WINDOW_MS = 60000, BEACON_MS = 5000;
static const uint8_t MAX_QUESTIONS = 3;
static const float RISE_FACTOR = 1.20f;

// ------------------------------------------------------------------ the feelings (codes match the server)
struct Feeling { uint8_t code; const char *name; int8_t ex; };      // ex: index into EXS, -1 = none
static const Feeling FEELINGS[] = {
  {1, "I'm fine", -1}, {2, "Worried", 0}, {3, "Sad", 1}, {4, "Angry", 2}, {5, "Scared", 3}, {6, "Stressed", 4},
  {7, "Jealous", 5}, {8, "Left out", 6}, {9, "Unwell", -1}, {10, "Just active/PT", -1}};
static const uint8_t JUNIOR[] = {1, 3, 4, 5, 9};                    // classes 3 to 5: six items with Talk
static bool junior = false;                                         // set at handout (flash)

// Exercises: text, seconds, phase (0 none, 1 in, 2 out, 3 hold). Rounds repeat the whole list.
struct Step { const char *text; uint8_t sec; uint8_t phase; };
static const Step EX_BOX[] = {{"Breathe in", 4, 1}, {"Hold", 4, 3}, {"Breathe out", 4, 2}, {"Hold", 4, 3}};
static const Step EX_GOOD3[] = {{"1 good thing", 10, 0}, {"2nd good thing", 10, 0}, {"3rd good thing", 10, 0}, {"In slowly", 5, 1}, {"Out slowly", 7, 2}, {"In slowly", 5, 1}, {"Out slowly", 7, 2}};
static const Step EX_46[] = {{"In for 4", 4, 1}, {"Out for 6", 6, 2}, {"In for 4", 4, 1}, {"Out for 6", 6, 2}, {"In for 4", 4, 1}, {"Out for 6", 6, 2}, {"Squeeze fists", 8, 3}, {"Let go", 8, 2}, {"In for 4", 4, 1}, {"Out for 6", 6, 2}};
static const Step EX_GROUND[] = {{"5 you see", 14, 0}, {"4 you touch", 12, 0}, {"3 you hear", 12, 0}, {"2 you smell", 10, 0}, {"1 slow breath", 12, 2}};
static const Step EX_CALM[] = {{"Drop shoulders", 8, 0}, {"Breathe in", 5, 1}, {"Breathe out", 7, 2}, {"Unclench jaw", 8, 0}, {"Breathe in", 5, 1}, {"Breathe out", 7, 2}, {"One small step", 10, 0}, {"Breathe out", 10, 2}};
static const Step EX_KIND[] = {{"Jealous is ok", 10, 0}, {"In", 5, 1}, {"Out", 7, 2}, {"In", 5, 1}, {"Out", 7, 2}, {"Kind thought", 13, 0}, {"One for you", 13, 0}};
static const Step EX_SLOW[] = {{"In slowly", 5, 1}, {"Out slowly", 7, 2}};
struct Exercise { const Step *steps; uint8_t n; uint8_t rounds; };
static const Exercise EXS[] = {{EX_BOX, 4, 4}, {EX_GOOD3, 7, 1}, {EX_46, 10, 1}, {EX_GROUND, 5, 1}, {EX_CALM, 8, 1}, {EX_KIND, 7, 1}, {EX_SLOW, 2, 4}};

// ------------------------------------------------------------------ the emotion model (scored on the band)
// Layout written by the gateway: child{n(u32), f[10](u16), x[29][10](u16)} then school{same}.
// Features, in order: period(13) rise(4) move(3) tod(3) dow(6) = 29 values.
static const uint8_t NF = 10, NV = 29, FOFF[5] = {0, 13, 17, 20, 23}, FLEN[5] = {13, 4, 3, 3, 6};
struct Counts { uint32_t n; uint16_t f[NF]; uint16_t x[NV][NF]; };
Counts childM, schoolM;
static const float W_PRIOR = 16.0f, PW = 0.5f;

// ------------------------------------------------------------------ timetable (written by a gateway each morning)
struct Period { uint16_t startMin, endMin; uint8_t subject; bool pauses; };   // subject: index into the model's period list
Period tt[12]; uint8_t ttN = 0;

// ------------------------------------------------------------------ state
Preferences prefs;
MAX30105 hr;
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
uint8_t key[16];               // flashed at handout; never leaves the band or the server
uint32_t counter = 0;
uint32_t epochBase = 0, epochBaseMs = 0;   // last known server epoch and when we learned it
float baseMean[3] = {0, 0, 0}, baseM2[3] = {0, 0, 0}; uint32_t baseN[3] = {0, 0, 0};
float tune = 0;                // "I'm fine" / "just active" raise the threshold a little
float bpm = 0; uint32_t lastBeatMs = 0; int battPct = 0;
uint32_t stillSinceMs = 0, raisedSinceMs = 0, lastAskMs = 0, askUntilMs = 0, reaskAtMs = 0;
uint32_t ptUntilMs = 0, sosAtMs = 0, confirmUntilMs = 0, lastBeaconMs = 0, flashUntilMs = 0;
uint8_t questionsToday = 0; uint32_t questionDay = 0; bool asked = false, reasking = false, pausedByHealth = false;
enum Mode { M_IDLE, M_MENU, M_TALK, M_PT, M_PTOFFER, M_NURSE, M_EXERCISE, M_BETTER, M_CONFIRM_SOS, M_SOS, M_MESSAGE, M_FLASH } mode = M_IDLE;
int8_t menu[16]; uint8_t menuN = 0, menuI = 0, star = 0, subI = 0;   // >0 feeling code, -1 talk, -2 PT, -3 danger
uint8_t menuRise = 0; bool menuAsked = false;
const Exercise *ex = nullptr; uint8_t exStep = 0, exRound = 0; uint32_t exStepEndMs = 0; uint8_t exFeeling = 0;
char flashText[24]; char msgText[64]; uint8_t msgId = 0; bool msgWaiting = false; char sosText[40];

struct Pending { uint8_t pkt[19]; uint32_t counter; uint8_t rid[4]; uint8_t tries; uint32_t nextMs; bool quiet; bool warned; bool used; bool oneShot; };
Pending pending[8];
volatile bool receiptArrived = false; uint8_t receiptBuf[22];
volatile bool inboxArrived = false; uint8_t inboxBuf[64]; volatile bool modelArrived = false, ttArrived = false; std::string modelBuf, ttBuf;
bool timeVerified = false;   // set by the first verified receipt after boot

// ------------------------------------------------------------------ helpers
static void be32(uint8_t *o, uint32_t v) { o[0] = v >> 24; o[1] = v >> 16; o[2] = v >> 8; o[3] = v; }
static uint32_t rd32(const uint8_t *p) { return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | p[3]; }
static uint32_t epochNow() { return epochBase + (millis() - epochBaseMs) / 1000 / EPOCH_SECONDS; }
static uint32_t localSeconds() { return epochNow() * EPOCH_SECONDS + TZ_SECONDS; }     // 15-minute resolution
static uint16_t minuteOfDay() { return (localSeconds() % 86400) / 60; }
static uint8_t todBucket() { uint16_t m = minuteOfDay(); return m < 630 ? 0 : m < 780 ? 1 : 2; }       // morning / mid / afternoon
static uint8_t dayOfWeek() { return (((localSeconds() / 86400) + 3) % 7) + 1; }                          // 1 = Monday
static float sd(uint8_t t) { return baseN[t] > 1 ? sqrtf(baseM2[t] / (baseN[t] - 1)) : 0; }
static bool learned() { return baseN[todBucket()] >= LEARN_SAMPLES; }
static float threshold() { return baseMean[todBucket()] * (RISE_FACTOR + tune); }
static const Period *periodNow() { uint16_t m = minuteOfDay(); for (uint8_t i = 0; i < ttN; i++) if (m >= tt[i].startMin && m < tt[i].endMin) return &tt[i]; return nullptr; }
static bool noticing() { const Period *p = periodNow(); return learned() && !pausedByHealth && millis() > ptUntilMs && !(p && p->pauses); }

static void hmac16(const uint8_t *data, size_t len, uint8_t out[32]) {
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), key, 16, data, len, out);
}
static void rotatingId(uint32_t epoch, uint8_t rid[4]) {
  uint8_t in[7] = {'r', 'i', 'd'}; be32(in + 3, epoch); uint8_t mac[32]; hmac16(in, 7, mac); memcpy(rid, mac, 4);
}

// 19 bytes: ver(1) rid(4) counter(4) | ct(2) tag(8). Nonce = rid|counter|epoch|ver, AAD = header.
static void buildPacket(uint32_t ctr, uint32_t epoch, uint8_t type, uint8_t arg, uint8_t out[19], uint8_t rid[4]) {
  rotatingId(epoch, rid);
  out[0] = VERSION; memcpy(out + 1, rid, 4); be32(out + 5, ctr);
  uint8_t nonce[13]; memcpy(nonce, rid, 4); be32(nonce + 4, ctr); be32(nonce + 8, epoch); nonce[12] = VERSION;
  uint8_t plain[2] = {type, arg};
  mbedtls_ccm_context ccm; mbedtls_ccm_init(&ccm);
  mbedtls_ccm_setkey(&ccm, MBEDTLS_CIPHER_ID_AES, key, 128);
  mbedtls_ccm_encrypt_and_tag(&ccm, 2, nonce, 13, out, 9, plain, out + 9, out + 11, 8);
  mbedtls_ccm_free(&ccm);
}

// Receipt (22 bytes): 'R' rid(4) counter(4) status(1) server_epoch(4) | tag(8) = HMAC(key, "rcpt"||body)[:8]
static int verifyReceipt(const uint8_t *r, const uint8_t rid[4], uint32_t ctr, uint32_t *serverEpoch) {
  if (r[0] != 'R') return -1;
  uint8_t in[18] = {'r', 'c', 'p', 't'}; memcpy(in + 4, r, 14);
  uint8_t mac[32]; hmac16(in, 18, mac);
  uint8_t diff = 0; for (int i = 0; i < 8; i++) diff |= mac[i] ^ r[14 + i];   // constant time
  if (diff || memcmp(r + 1, rid, 4) != 0 || rd32(r + 5) != ctr) return -1;
  *serverEpoch = rd32(r + 10);
  return r[9];
}

// ------------------------------------------------------------------ motor
static void buzz(const uint16_t *pattern, int n) {   // on, off, on, off...
  for (int i = 0; i < n; i++) { digitalWrite(PIN_MOTOR, i % 2 == 0); delay(pattern[i]); }
  digitalWrite(PIN_MOTOR, LOW);
}
static const uint16_t BZ_ONE[] = {120}, BZ_TWO[] = {120, 120, 120}, BZ_ASK[] = {60, 80, 60, 80, 60}, BZ_LONG[] = {700}, BZ_MSG[] = {300, 150, 300};
static void pulse(uint16_t ms) { digitalWrite(PIN_MOTOR, HIGH); delay(ms); digitalWrite(PIN_MOTOR, LOW); }

// ------------------------------------------------------------------ the model: top suggestion for now
static uint8_t featureValue(uint8_t f, uint8_t riseB, uint8_t moveB) {
  const Period *p = periodNow();
  switch (f) { case 0: return p ? p->subject : 12; case 1: return riseB; case 2: return moveB; case 3: return todBucket(); default: return min<uint8_t>(dayOfWeek(), 6) - 1; }
}
static uint8_t suggestFeeling(uint8_t riseB, uint8_t moveB, const uint8_t *codes, uint8_t nCodes) {
  float best = -1e9; uint8_t bestCode = codes[0];
  for (uint8_t c = 0; c < nCodes; c++) {
    uint8_t k = codes[c] - 1;
    float ps = (schoolM.f[k] + 1.0f) / (schoolM.n + 1.0f * nCodes);
    float nf = childM.f[k];
    float s = logf((nf + W_PRIOR * ps + 0.01f) / (childM.n + W_PRIOR + 0.01f * nCodes));
    for (uint8_t f = 0; f < 5; f++) {
      uint8_t v = featureValue(f, riseB, moveB); uint8_t idx = FOFF[f] + min<uint8_t>(v, FLEN[f] - 1);
      float sch = (schoolM.x[idx][k] + 1.0f) / (schoolM.f[k] + 1.0f * FLEN[f]);
      float mine = childM.x[idx][k];
      s += PW * logf((mine + W_PRIOR * sch) / (nf + W_PRIOR));
    }
    if (s > best) { best = s; bestCode = codes[c]; }
  }
  return bestCode;
}

// ------------------------------------------------------------------ radio
NimBLEAdvertising *adv;
class ReceiptCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { std::string v = c->getValue(); if (v.size() == 22 && !receiptArrived) { memcpy(receiptBuf, v.data(), 22); receiptArrived = true; } }
};
class TimeCb : public NimBLECharacteristicCallbacks {   // accepted only until the first signed receipt
  void onWrite(NimBLECharacteristic *c) override { std::string v = c->getValue(); if (v.size() == 4 && !timeVerified) { epochBase = rd32((const uint8_t *)v.data()); epochBaseMs = millis(); } }
};
class InboxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { std::string v = c->getValue(); if (v.size() >= 2 && v.size() <= 62 && !inboxArrived) { memcpy(inboxBuf, v.data(), v.size()); inboxBuf[v.size()] = 0; inboxArrived = true; } }
};
class ModelCb : public NimBLECharacteristicCallbacks { void onWrite(NimBLECharacteristic *c) override { modelBuf = c->getValue(); modelArrived = true; } };
class TtCb : public NimBLECharacteristicCallbacks { void onWrite(NimBLECharacteristic *c) override { ttBuf = c->getValue(); ttArrived = true; } };

static void advertise(const uint8_t pkt[19]) {
  std::string md; md.push_back(COMPANY_ID & 0xFF); md.push_back(COMPANY_ID >> 8);
  md.append((const char *)pkt, 19);
  NimBLEAdvertisementData d; d.setFlags(0x06); d.setManufacturerData(md);
  adv->stop(); adv->setAdvertisementData(d); adv->start(3);   // advertise for 3 s per try
}

static void send(uint8_t type, uint8_t arg, bool quiet = false, bool oneShot = false) {
  counter++; prefs.putUInt("ctr", counter);          // never reuse a counter, even after a reset
  for (auto &p : pending) if (!p.used) {
    p.used = true; p.counter = counter; p.tries = 0; p.nextMs = millis(); p.quiet = quiet; p.warned = false; p.oneShot = oneShot;
    buildPacket(counter, epochNow(), type, arg, p.pkt, p.rid);
    return;
  }
}
static uint8_t packFeeling(uint8_t code, uint8_t rise, bool askedB, bool accepted) { return (code & 15) | ((rise & 3) << 4) | (askedB ? 64 : 0) | (accepted ? 128 : 0); }

static void loadModel() {   // child then school, little-endian counts as written by the gateway
  size_t one = sizeof(Counts); if (modelBuf.size() != 2 * one) return;
  memcpy(&childM, modelBuf.data(), one); memcpy(&schoolM, modelBuf.data() + one, one);
}
static void loadTimetable() {   // [n, then n x (startMin u16, endMin u16, subject u8, pauses u8)]
  if (ttBuf.empty()) return; uint8_t n = min<size_t>((uint8_t)ttBuf[0], 12); ttN = 0;
  for (uint8_t i = 0; i < n && 1 + (i + 1) * 6 <= ttBuf.size(); i++) {
    const uint8_t *b = (const uint8_t *)ttBuf.data() + 1 + i * 6;
    tt[ttN++] = {(uint16_t)(b[0] | b[1] << 8), (uint16_t)(b[2] | b[3] << 8), b[4], b[5] != 0};
  }
}

static const uint32_t RETRY_MS[] = {0, 2000, 5000, 15000, 60000};
static void radioLoop() {
  if (receiptArrived) {
    for (auto &p : pending) if (p.used) {
      uint32_t se; int st = verifyReceipt(receiptBuf, p.rid, p.counter, &se);
      if (st < 0) continue;
      p.used = false; epochBase = se; epochBaseMs = millis(); timeVerified = true;   // authenticated time
      if (st == 2) { msgWaiting = true; buzz(BZ_MSG, 3); } else if (!p.quiet) buzz(BZ_ONE, 1);
      break;
    }
    receiptArrived = false;
  }
  if (inboxArrived) {   // [id, len, text...]
    msgId = inboxBuf[0]; uint8_t n = min<int>(inboxBuf[1], 60); memcpy(msgText, inboxBuf + 2, n); msgText[n] = 0;
    inboxArrived = false; msgWaiting = false; buzz(BZ_MSG, 3);
    if (strncmp(msgText, "Ms ", 3) == 0 && strstr(msgText, "is coming")) strncpy(sosText, msgText, sizeof(sosText) - 1);
    if (mode != M_EXERCISE && mode != M_CONFIRM_SOS) mode = M_MESSAGE;
  }
  if (modelArrived) { loadModel(); modelArrived = false; }
  if (ttArrived) { loadTimetable(); ttArrived = false; }
  for (auto &p : pending) if (p.used && millis() >= p.nextMs) {
    advertise(p.pkt);
    p.tries++;
    if (p.oneShot) { p.used = false; break; }
    if (p.tries == 5 && !p.quiet && !p.warned) { p.warned = true; buzz(BZ_TWO, 3); }
    p.nextMs = millis() + RETRY_MS[min<int>(p.tries, 4)];
    break;   // one message on air at a time
  }
}

// ------------------------------------------------------------------ sensors
static uint8_t moveLevel = 0;   // 0 still, 1 light, 2 active
static float motion() {   // MPU6050 accel magnitude change, raw registers to avoid another library
  static float last = 0;
  Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(0x68, 6);
  int16_t ax = Wire.read() << 8 | Wire.read(), ay = Wire.read() << 8 | Wire.read(), az = Wire.read() << 8 | Wire.read();
  float m = sqrtf((float)ax * ax + (float)ay * ay + (float)az * az) / 16384.0f;
  float d = fabsf(m - last); last = m; return d;
}
static uint8_t riseBucket() { if (!learned()) return 0; float pct = (bpm / baseMean[todBucket()] - 1) * 100; return pct >= 45 ? 3 : pct >= 30 ? 2 : pct >= 20 ? 1 : 0; }

static void openMenu(bool askedB) {
  menuAsked = askedB; menuRise = riseBucket();
  uint8_t codes[10], n = 0;
  if (junior) { for (uint8_t c : JUNIOR) codes[n++] = c; }
  else for (uint8_t c = 1; c <= 10; c++) if (askedB || c != 10) codes[n++] = c;
  star = suggestFeeling(menuRise, moveLevel, codes, n);
  menuN = 0; menu[menuN++] = star;
  for (uint8_t i = 0; i < n; i++) if (codes[i] != star) menu[menuN++] = codes[i];
  menu[menuN++] = -1;
  if (!askedB && !junior) menu[menuN++] = -2;
  if (!junior) menu[menuN++] = -3;
  menuI = 0; mode = M_MENU; askUntilMs = millis() + ASK_WINDOW_MS;
}

static void ask(bool again) {
  if (!again) { questionsToday++; lastAskMs = millis(); }
  reasking = again; reaskAtMs = 0; buzz(BZ_ASK, 5); openMenu(true);
}

static void senseLoop() {
  long ir = hr.getIR();
  if (ir > 50000 && checkForBeat(ir)) {
    uint32_t now = millis(), dt = now - lastBeatMs; lastBeatMs = now;
    float b = 60000.0f / dt; if (b > 40 && b < 200) bpm = bpm ? bpm * 0.8f + b * 0.2f : b;
  }
  static uint32_t lastSample = 0;
  if (millis() - lastSample < 1000) return;
  lastSample = millis();
  float d = motion(); moveLevel = d < 0.08f ? 0 : d < 0.3f ? 1 : 2;
  uint32_t day = localSeconds() / 86400; if (day != questionDay) { questionDay = day; questionsToday = 0; }
  bool worn = ir > 50000, still = moveLevel == 0;
  if (!worn || !still) { stillSinceMs = millis(); raisedSinceMs = millis(); return; }
  uint8_t t = todBucket();
  static uint32_t lastLearn = 0;   // learn from still readings only, and never from a raised one
  if (bpm > 0 && millis() - lastLearn > 10000 && (!learned() || bpm < threshold())) {
    lastLearn = millis(); baseN[t]++; float dd = bpm - baseMean[t]; baseMean[t] += dd / min<uint32_t>(baseN[t], 2000); baseM2[t] += dd * (bpm - baseMean[t]);
    if (baseN[t] % 30 == 0) { char k[8]; snprintf(k, 8, "bm%d", t); prefs.putFloat(k, baseMean[t]); snprintf(k, 8, "b2%d", t); prefs.putFloat(k, baseM2[t]); snprintf(k, 8, "bn%d", t); prefs.putUInt(k, baseN[t]); }
  }
  if (!noticing() || bpm < threshold()) raisedSinceMs = millis();
  if (mode == M_IDLE && noticing() && millis() - stillSinceMs > STILL_MS && millis() - raisedSinceMs > NOTICE_MS &&
      millis() - lastAskMs > COOLDOWN_MS && questionsToday < MAX_QUESTIONS) ask(false);
  if (mode == M_IDLE && reaskAtMs && millis() > reaskAtMs) ask(true);
}

// ------------------------------------------------------------------ choices
static void flash(const char *t, uint32_t ms = 2500) { strncpy(flashText, t, sizeof(flashText) - 1); flashUntilMs = millis() + ms; mode = M_FLASH; }

static void startExercise(uint8_t feelingIdx) {
  int8_t e = FEELINGS[feelingIdx].ex; if (e < 0) { flash("Thanks"); return; }
  ex = &EXS[e]; exStep = 0; exRound = 0; exStepEndMs = millis() + ex->steps[0].sec * 1000UL * 1;   // real band: about 60 s in total
  mode = M_EXERCISE;
}

static void choose(int8_t item) {
  if (item == -1) { mode = M_TALK; subI = 0; return; }
  if (item == -2) { mode = M_PT; subI = 0; return; }
  if (item == -3) { mode = M_CONFIRM_SOS; confirmUntilMs = millis() + CONFIRM_MS; buzz(BZ_LONG, 1); return; }
  uint8_t code = item; bool accepted = code == star;
  send(T_FEELING, packFeeling(code, menuRise, menuAsked, accepted));
  send(T_SUGGESTION, (accepted ? 1 : 0) | (moveLevel << 1) | (star << 3), true);
  reasking = false; reaskAtMs = 0;
  if (code == 1) { tune = min(0.35f, tune + 0.03f); flash("Thanks"); return; }
  if (code == 10) { tune = min(0.35f, tune + 0.03f); mode = M_PTOFFER; return; }
  if (code == 9) { mode = M_NURSE; return; }
  exFeeling = code - 1; startExercise(exFeeling);
}

static void sendSos(bool medical) { send(T_SOS, medical ? 1 : 0); sosAtMs = millis(); lastBeaconMs = millis(); sosText[0] = 0; mode = M_SOS; }
static void startPt(uint8_t min_) { ptUntilMs = millis() + min_ * 60000UL; send(T_PAUSE, min_); char b[24]; snprintf(b, 24, "PT mode %d min", min_); flash(b, 3000); }
static const uint8_t PT_MINUTES[] = {30, 45, 60};

// ------------------------------------------------------------------ the one button
static void onTap() {
  switch (mode) {
    case M_MENU: menuI = (menuI + 1) % menuN; askUntilMs = millis() + ASK_WINDOW_MS; break;
    case M_TALK: subI = (subI + 1) % 2; break;
    case M_PT: subI = (subI + 1) % 3; break;
    case M_CONFIRM_SOS: sendSos(false); break;
    case M_NURSE: flash("Get well soon"); break;
    case M_PTOFFER: flash("Okay"); break;
    case M_BETTER: send(T_EXERCISE, 1, true); flash("Glad"); break;
    default: break;
  }
}
static void onHold() {   // 1 second
  switch (mode) {
    case M_MENU: choose(menu[menuI]); break;
    case M_TALK: send(T_TALK, subI); flash(subI ? "Sent to counsellor" : "Sent to adult", 3500); break;
    case M_PT: startPt(PT_MINUTES[subI]); break;
    case M_PTOFFER: startPt(30); break;
    case M_NURSE: sendSos(true); break;
    case M_BETTER: send(T_EXERCISE, 2, true); mode = M_TALK; subI = 0; break;
    case M_EXERCISE: mode = M_BETTER; ex = nullptr; break;
    case M_MESSAGE: send(T_SEEN, msgId); mode = sosAtMs ? M_SOS : M_IDLE; flash("Okay", 1500); break;
    case M_IDLE: if (msgText[0]) mode = M_MESSAGE; break;
    default: break;
  }
}

static void buttonLoop() {
  static bool down = false; static uint32_t downAt = 0, lastTapAt = 0; static bool held5 = false, held2 = false; static int taps = 0;
  bool pressed = digitalRead(PIN_BUTTON) == LOW; uint32_t now = millis();
  if (pressed && !down) { down = true; downAt = now; held5 = held2 = false; }
  if (pressed && down) {
    bool sosOpen = mode == M_SOS && now - sosAtMs < CANCEL_WINDOW_MS;
    if (sosOpen && !held2 && now - downAt >= 2000) { held2 = true; send(T_CANCEL, 0); sosAtMs = 0; flash("SOS cancelled"); }
    else if (!sosOpen && !held5 && mode != M_SOS && now - downAt >= HOLD_SOS_MS) { held5 = true; taps = 0; mode = M_CONFIRM_SOS; confirmUntilMs = now + CONFIRM_MS; buzz(BZ_LONG, 1); }
  }
  if (!pressed && down) {
    down = false; uint32_t dur = now - downAt;
    if (held5 || held2) { /* already handled while held */ }
    else if (dur >= HOLD_CHOOSE_MS) { taps = 0; onHold(); }
    else if (dur < 600) {
      if (mode == M_IDLE) { taps++; lastTapAt = now; if (taps == 2) { taps = 0; openMenu(false); } }
      else onTap();
    }
  }
  if (taps == 1 && now - lastTapAt > 400) taps = 0;   // a single tap in idle just wakes the screen
  if (mode == M_CONFIRM_SOS && now > confirmUntilMs) mode = M_IDLE;
  if (mode == M_MENU && menuAsked && now > askUntilMs) { mode = M_IDLE; if (!reasking) reaskAtMs = now + REASK_MS; else { send(T_SKIPPED, 0, true); reasking = false; } }
  if (mode == M_SOS && sosAtMs && now - sosAtMs > 3600000UL) { mode = M_IDLE; sosAtMs = 0; }
  if (mode == M_FLASH && now > flashUntilMs) mode = sosAtMs ? M_SOS : M_IDLE;
}

static void exerciseLoop() {
  if (mode != M_EXERCISE || !ex) return;
  if (millis() < exStepEndMs) return;
  exStep++;
  if (exStep >= ex->n) { exStep = 0; exRound++; if (exRound >= ex->rounds) { mode = M_BETTER; ex = nullptr; return; } }
  const Step &s = ex->steps[exStep]; exStepEndMs = millis() + s.sec * 1000UL;
  if (s.phase == 1) pulse(600); else if (s.phase == 2) pulse(200); else if (s.phase == 3) pulse(60);
}

static void sosLoop() { if (mode == M_SOS && millis() - lastBeaconMs >= BEACON_MS) { lastBeaconMs = millis(); send(T_STATUS, 0, true, true); } }

static void statusLoop() {   // ask the gateway whether a message is waiting (receipt status 2)
  static uint32_t last = 0; if (millis() - last < 20000 || (!sosAtMs && !msgWaiting)) return; last = millis(); send(T_STATUS, 0, true, true);
}

static void batteryLoop() {
  static uint32_t last = 0; static int sent = -100;
  if (millis() - last < 600000) return; last = millis();
  int mv = analogReadMilliVolts(PIN_BATT) * 2;
  int pct = constrain(map(mv, 3300, 4150, 0, 100), 0, 100); battPct = pct;
  if (abs(pct - sent) >= 5) { sent = pct; send(T_BATTERY, pct, true); }
}

// ------------------------------------------------------------------ the screen (128x64, English only)
static void line(int y, const char *s, const uint8_t *font = u8g2_font_6x12_tf) { oled.setFont(font); int w = oled.getStrWidth(s); oled.drawStr((128 - w) / 2, y, s); }
static const char *itemName(int8_t it) { if (it == -1) return "Talk to someone"; if (it == -2) return "PT / sports"; if (it == -3) return "I'm in danger"; return FEELINGS[it - 1].name; }
static void drawScreen() {
  static uint32_t last = 0; if (millis() - last < 150) return; last = millis();
  oled.clearBuffer(); char b[40];
  snprintf(b, 40, "%d bpm  %d%%%s", (int)bpm, battPct, millis() < ptUntilMs ? "  PT" : ""); line(10, b, u8g2_font_5x7_tf);
  switch (mode) {
    case M_IDLE: line(34, msgText[0] ? "Message waiting" : (noticing() ? "-" : (learned() ? "paused" : "learning")), u8g2_font_7x13B_tf); line(60, "2 taps: menu", u8g2_font_5x7_tf); break;
    case M_MENU: line(24, menuAsked ? "How are you?" : "Menu", u8g2_font_5x7_tf); snprintf(b, 40, "%s%s", menu[menuI] == star ? "* " : "", itemName(menu[menuI])); line(42, b, u8g2_font_7x13B_tf);
      snprintf(b, 40, "%d/%d", menuI + 1, menuN); line(54, b, u8g2_font_5x7_tf); line(63, "tap next  hold choose", u8g2_font_4x6_tf); break;
    case M_TALK: line(24, "Talk to:", u8g2_font_5x7_tf); line(42, subI ? "Counsellor" : "My adult", u8g2_font_7x13B_tf); line(63, "tap next  hold send", u8g2_font_4x6_tf); break;
    case M_PT: line(24, "PT mode for:", u8g2_font_5x7_tf); snprintf(b, 40, "%d min", PT_MINUTES[subI]); line(42, b, u8g2_font_7x13B_tf); line(63, "tap next  hold start", u8g2_font_4x6_tf); break;
    case M_PTOFFER: line(34, "PT mode 30 min?", u8g2_font_7x13B_tf); line(63, "hold yes  tap no", u8g2_font_4x6_tf); break;
    case M_NURSE: line(34, "Need the nurse?", u8g2_font_7x13B_tf); line(63, "hold yes  tap no", u8g2_font_4x6_tf); break;
    case M_EXERCISE: if (ex) { line(24, FEELINGS[exFeeling].name, u8g2_font_5x7_tf); line(42, ex->steps[exStep].text, u8g2_font_7x13B_tf); snprintf(b, 40, "%lus", (unsigned long)((exStepEndMs - millis()) / 1000)); line(56, b, u8g2_font_5x7_tf); } break;
    case M_BETTER: line(34, "Feel better?", u8g2_font_7x13B_tf); line(63, "tap yes  hold talk", u8g2_font_4x6_tf); break;
    case M_CONFIRM_SOS: line(34, "Send SOS?", u8g2_font_7x13B_tf); line(63, "tap to confirm", u8g2_font_4x6_tf); break;
    case M_SOS: line(26, sosText[0] ? sosText : "SOS sent", u8g2_font_6x12_tf); line(44, "Help is coming", u8g2_font_5x7_tf); if (millis() - sosAtMs < CANCEL_WINDOW_MS) line(63, "hold 2 s = cancel", u8g2_font_4x6_tf); break;
    case M_MESSAGE: line(24, "Message", u8g2_font_5x7_tf); line(42, msgText, u8g2_font_5x7_tf); line(63, "hold = Okay", u8g2_font_4x6_tf); break;
    case M_FLASH: line(38, flashText, u8g2_font_7x13B_tf); break;
  }
  oled.sendBuffer();
}

// Handout: the school's laptop sends "KEY <32 hex> EPOCH <n> [JUNIOR]" over USB once (tools/provision_band.py).
static void provision() {
  Serial.begin(115200);
  while (true) {
    Serial.println("PRERANA-BAND READY");
    String line = Serial.readStringUntil('\n'); line.trim();
    int k = line.indexOf("KEY "), e = line.indexOf(" EPOCH ");
    if (k == 0 && e == 36) {
      for (int i = 0; i < 16; i++) key[i] = strtoul(line.substring(4 + 2 * i, 6 + 2 * i).c_str(), nullptr, 16);
      prefs.putBytes("key", key, 16); prefs.putUInt("ep", line.substring(43).toInt()); prefs.putUInt("ctr", 0); prefs.putBool("jr", line.indexOf("JUNIOR") > 0);
      Serial.println("OK"); buzz(BZ_ONE, 1); delay(200); ESP.restart();
    }
    buzz(BZ_TWO, 3); delay(2000);
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  pinMode(PIN_BUTTON, INPUT_PULLUP); pinMode(PIN_MOTOR, OUTPUT);
  prefs.begin("pulse", false);
  if (prefs.getBytes("key", key, 16) != 16) provision();   // first boot at handout
  counter = prefs.getUInt("ctr", 0) + 16;   // skip ahead in case the last writes were lost
  epochBase = prefs.getUInt("ep", 0); epochBaseMs = millis(); junior = prefs.getBool("jr", false);
  for (uint8_t t = 0; t < 3; t++) { char k[8]; snprintf(k, 8, "bm%d", t); baseMean[t] = prefs.getFloat(k, 0); snprintf(k, 8, "b2%d", t); baseM2[t] = prefs.getFloat(k, 0); snprintf(k, 8, "bn%d", t); baseN[t] = prefs.getUInt(k, 0); }

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();   // wake MPU6050
  if (hr.begin(Wire, I2C_SPEED_FAST)) { hr.setup(0x1F, 4, 2, 100, 411, 4096); }
  oled.begin(); oled.setContrast(120);

  NimBLEDevice::init("");                     // no name: the rotating id is the only identifier
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEServer *srv = NimBLEDevice::createServer();
  NimBLEService *svc = srv->createService(SVC_UUID);
  svc->createCharacteristic(RECEIPT_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new ReceiptCb());
  svc->createCharacteristic(TIME_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new TimeCb());
  svc->createCharacteristic(INBOX_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new InboxCb());
  svc->createCharacteristic(MODEL_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new ModelCb());
  svc->createCharacteristic(TT_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(new TtCb());
  svc->start();
  adv = NimBLEDevice::getAdvertising();
  adv->setMinInterval(160); adv->setMaxInterval(240);   // 100-150 ms while a message is pending
}

void loop() {
  buttonLoop();
  senseLoop();
  exerciseLoop();
  sosLoop();
  statusLoop();
  radioLoop();
  batteryLoop();
  drawScreen();
  static uint32_t lastEp = 0;
  if (millis() - lastEp > 3600000) { lastEp = millis(); prefs.putUInt("ep", epochNow()); }
  delay(5);
}
