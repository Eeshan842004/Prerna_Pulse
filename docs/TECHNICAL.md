# Prerana Pulse: technical documentation (band-only, v2)

Team Monarch · PRASUNEX Innovathon 2026. This describes what is in this repository. Where something is simulated or untested it says so.

## 1. What the prototype does

The child uses **only the band** (no phone, no tablet, nothing typed). Adults use one phone app with four roles: teacher, counsellor, principal, parent.

1. **The band notices and asks, privately.** It learns the child's own resting heart rate for three times of day. It asks only when the rate is at least 20% above her normal for that time of day, for 2 minutes, while she has been still for 5 minutes, outside PT mode and PT periods, fewer than 3 times that day, and sensing is not paused by her health profile. The vibration is felt only by her.
2. **She names the feeling** on a small round screen with one button: the model's likely word first (★), then the rest. A matching 1-minute exercise runs on the wrist. One feeling is private.
3. **The same difficult feeling on 5 of the last 10 school days** reaches the counsellor with the name.
4. **Talk to someone** goes to the adult she chose with a deadline. The adult answers with **Call to talk** (when and where); the band shows it, and that response is the only thing that stops the clock. No response: it moves up on its own (chosen adult → counsellor → principal → management).
5. **SOS** (hold 5 s, then tap) alerts the counsellor, principal and class teacher at once with the child's room-level location (the strongest gateway), repeats by SMS and call until someone goes, and shows "Ms Khan is coming" on the band.
6. **PT mode** (child-set or from the timetable) pauses asking. **Class weather** (no names) gives the class teacher an activity. **The principal** sees a response report. **Parents** control consent and hear only from the counsellor.

## 2. Architecture

```
 Pulse Band (ESP32-C3 + OLED)        Gateways (Bluetooth in, HTTPS out)        Prerana Pulse service (FastAPI)        Adult app
 notices, asks privately,      ───►  hub / school PC / office root       ───►  ingest (verify, keep one, RSSI)        teacher
 feelings menu, exercises,            each has a known place on the map        signed receipts                        counsellor
 talk, SOS, PT mode                   offline queue, heartbeats                 reply clocks, SOS, rules               principal
 19 encrypted bytes                                                             per-child emotion model                parent
 buzzes once on a signed receipt                                                PostgreSQL 16 (RLS, timers, outbox)
```

| Part | Code | Status |
|---|---|---|
| Server | `backend/app/` (FastAPI, psycopg 3, PostgreSQL 14+) | Built, 41 tests on PostgreSQL 16 |
| Band protocol and receipts | `backend/app/protocol.py`, `web/js/crypto.js` | Built, byte-identical in Python and the browser |
| Gateway | `gateway/gateway.py` (standard library only) | Built (simulated radio); Bluetooth mode written, untested |
| Virtual band | `web/js/band.js`, `web/js/views/bandview.js` | Built; runs the firmware's logic |
| In-browser engine | `web/js/engine.js` | Built, 17 tests; used when no server is present |
| Adult app and demo | `web/js/views/` | Built |
| Band firmware | `firmware/band/band.ino` | **Written, not compiled or tested on hardware** |

The same web app runs against the server (`api/config` reports version 2.x and the badge says "Live server") or against the in-browser engine ("Runs in your browser"). Views never know which.

## 3. The band's logic (firmware and virtual band)

**Learn → Notice → Tune → Reset.** Running mean and variance of still, worn readings, per time of day (morning, midday, afternoon). It never learns from a raised reading. "I'm fine" and "Just active" raise the threshold a little; difficult feelings keep it. It relearns every term.

**One button.** Tap = next · hold 1 s = choose · double tap (idle) = open the menu · hold 5 s = SOS (a long buzz, then tap to confirm) · hold 2 s within 60 s = cancel.

**Menu (in order):** the model's suggestion (★), then I'm fine, Worried, Sad, Angry, Scared, Stressed, Jealous, Left out, Unwell, Just active/PT, Talk to someone, I'm in danger. Junior mode (classes 3 to 5): Fine, Sad, Angry, Scared, Unwell, Talk.

**Exercises (about 1 minute, vibration-guided):** box breathing (worried), 3 good things + slow breathing (sad), 4–6 breathing + squeeze/release (angry), 5-4-3-2-1 grounding (scared), 1-minute calm (stressed), name it / one kind thought (jealous), slow breathing + offer to talk (left out). Then "Feel better?" (tap = yes, hold = talk).

**Asking again:** no answer → asks again in 10 minutes → logged as skipped. Three skipped in a row → a quiet note to her chosen adult.

**Vibration language:** 1 short = the school has it · 2 short = not yet, still trying · 3 soft = "How are you?" · slow rhythm = breathe along · 1 long = confirm SOS · 2 long = a message from an adult.

**Demo timing.** The virtual band shortens learning (2 weeks → seconds), the "still" wait and the exercises, and the page says so ("Demo speed").

## 4. Band protocol

A band message is **19 bytes**: `ver(1) | rotating id(4) | counter(4) | AES-CCM(type, arg) (2) | tag(8)`.

- Rotating id = HMAC-SHA256(band key, "rid" ‖ epoch)[:4], epoch = unix time / 900 (changes every 15 minutes, so a gateway cannot follow a child around).
- Nonce = rid ‖ counter ‖ epoch ‖ ver; the 9 header bytes are authenticated data. The type is encrypted.
- **Receipt (22 bytes):** `'R' | rid | counter | status | server_epoch | tag`, tag = HMAC(band key, "rcpt" ‖ body)[:8]. Signed only **after** the database commit. Status: 0 ok · 1 duplicate · 2 "a message from an adult is waiting".

| Type | Name | arg |
|---|---|---|
| 1 | feeling | bits 0–3 feeling code (1 fine … 10 just active), bits 4–5 heart-rate rise bucket, bit 6 the band asked, bit 7 the child accepted the ★ |
| 2 | skipped | a question went unanswered |
| 3 | talk | 0 = my adult, 1 = counsellor |
| 4 | sos | 0 = danger, 1 = medical |
| 5 | cancel | cancel an SOS within 60 s |
| 6 | status | "anything for me?"; during an SOS it is the location beacon (every 5 s) |
| 7 | battery | percent |
| 8 | pause | PT mode minutes (0 = off) |
| 9 | seen | low byte of the message id the child pressed Okay on |
| 10 | exercise | 1 felt better, 2 wants to talk |
| 11 | suggestion | bit 0 accepted ★, bits 1–2 movement, bits 3–6 the suggested feeling |

**Messages for the band** (max 60 characters, from adult-side quick choices) are stored in `band_messages`. When one is waiting, the next receipt carries status 2 and the band fetches it through a gateway (`/api/demo/band-inbox` in the prototype; a GATT characteristic on the firmware).

**Threats and answers**

| Threat | What we do |
|---|---|
| Fake press | Per-band key; 8-byte tag checked; any flipped bit is rejected (tested) |
| Replayed press | The counter must go up; old values are dropped (tested) |
| Gateway snooping | Rotating id and encrypted type: it relays bytes it can't read |
| Gateway fakes "sent" | Only the server can sign a receipt with the band's key |
| Staff snooping | Role limits; a reason logged for every read; the child's history shows who opened what |
| Tracking a child | Location only during an SOS, only inside school, only to SOS recipients |
| Lost band | Its key is revoked; the band holds no personal data beyond its own small model |
| Prank SOS | Hold + confirm, 60 s cancel, a daily cap on SMS repeats (the SOS itself is never dropped); a first misuse means a talk |

## 5. Gateways and SOS location

- Gateways forward each packet over HTTPS (port 443) with the **signal strength (RSSI)** they heard it at, queue to disk when the internet is down, and send heartbeats. One program runs on hubs and school PCs.
- Each gateway has a known place and map coordinates (`gateways.location, map_x, map_y`).
- While an SOS is open, every gateway that hears the beacon adds a row to `sightings`. The server picks the **strongest sighting in the last 30 seconds** (else the last few) as the child's place, appends changes to the case's `trail`, and pushes the update to the SOS recipients.
- Accuracy is room or corridor level. No GPS. In the prototype the signal strength comes from the virtual band's "Where is she?" control via a simple path-loss model; on real radios it would come from the Bluetooth scanner.

## 6. Server rules

### 6.1 Talk requests and the reply clock

| Request to | First deadline | Then |
|---|---|---|
| Chosen adult | End of school day (3:30 pm if at least 1 h is left, else the next school day) | Counsellor by 12:00 next school day → Principal by 4:00 pm next school day → management flag |
| Counsellor (direct) | End of school day | Principal → management flag |
| About a staff member (via "About staff" hand-over) | Same school day 4:00 pm | Management; the named person's own chain never sees it |

- Reminders at 50% and 80% of the time. **Only Call to talk (a real response) stops the clock; opening does not.** Schools can shorten clocks, never lengthen them.
- Calendar: Asia/Kolkata, Monday–Saturday, holidays respected.
- **Why it doesn't fail quietly:** timers are rows in PostgreSQL next to the case, claimed with `SELECT … FOR UPDATE SKIP LOCKED`; alerts leave through an `outbox` table, so a crash can repeat an alert but never lose one.

### 6.2 SOS

Alerted at once: counsellor, principal, the child's class teacher; nurse if medical or the health profile says so; POCSO officer if the school adds them. 10 minutes to "I'm going"; then SMS + a call task to everyone every 10 minutes (daily cap per child), until someone goes. The child can cancel within 60 seconds. A second press while help is on the way does not make a second alert.

### 6.3 Feelings, rules and class weather (all versioned)

| Rule | Trigger | Who hears | Name? |
|---|---|---|---|
| One-off feeling | any single feeling | nobody | no |
| Persistent feeling | the same difficult feeling on 5 of the last 10 school days (14-day cool-down per feeling) | counsellor | yes |
| Goes quiet | 3 band questions skipped in a row | chosen adult | yes |
| Band silent | no contact for a whole school day (checked after 3:30 pm) | class teacher | yes |
| Class tension | share of difficult feelings ≥ 2× the school median for 3 school days (and ≥ 15%) | class teacher: an activity | **no** |
| Unanswered | nobody responded at any level | management and principal | yes |

Class weather uses only anonymous rows (`mood` has no student column) and hides any group under 10.

### 6.4 The emotion model ("Prerana AI on the band")

A **per-child Naive Bayes classifier** with Laplace smoothing. Features: current period (from the timetable), size of the heart-rate rise, movement, time of day, weekday. A school-wide prior (worth 16 observations) helps new children; each confirmed choice updates the model online. It is tiny (about 300 counts per child), runs on the band and on the server, and **only orders the menu: the child always confirms**.

Measured online on simulated children with known habits (a held-out set, never used for tuning), predicting every choice before the model sees it, against "most common feeling so far": right first time about **47–49% vs 45–47%**; right feeling in the first three about **71–72% vs 67%**. A real but modest gain, shown on the Under the hood page and at `GET /api/model/card`. The settings were tuned on a separate set of simulated children. Real accuracy needs a pilot with real children. Both the browser and the Python implementations report their own measured numbers (the random sequences are not bit-identical).

### 6.5 Privacy rules built into the flow

- Every staff read needs a reason (≥ 3 characters), logged in `access_log` and shown in "Who opened this". `GET /api/cases/{id}` and `GET /api/students/{id}` return 428 until a reason is given. SOS cases are readable at once.
- Teachers never see an individual child's feelings (`/api/patterns` and `/api/students/*` are counsellor and principal only). The counsellor sees the 14-day row only if the parent's consent allows it, or the child has been reported by the 5-of-10 rule.
- Parents get no automatic alerts. The counsellor decides what to share (`/inform-parent`); the text is encrypted at rest.
- Students are stored by ERP reference; names come from the ERP adapter at display time.

## 7. Data model (PostgreSQL 14+; tested on 16)

Every tenant table has `FORCE ROW LEVEL SECURITY` with the policy `app.role = 'system' OR school_id = app.school_id`. The API connects as `pp_app` (NOSUPERUSER, NOBYPASSRLS).

`schools, classes, timetable, users, trusted_adults, consents, health_profiles, bands (key, last_counter, pt_until, model), gateways (location, map_x, map_y), band_events (UNIQUE band_id+counter), sightings, cases, band_messages, case_events (append-only hash chain), timers, outbox, notifications, feelings, exercises, mood (anonymous), alerts, access_log, activities, parent_messages (encrypted)`.

`cases.kind` is `talk | sos | medical_sos`; `status` is `open | acknowledged | responded | resolved | cancelled`. `case_events` has UPDATE/DELETE revoked and blocked by a trigger, and each row stores `hash = sha256(prev_hash ‖ event)`, so tampering is detected (`/verify` and the "History can't be changed ✓" line).

## 8. API (main routes)

| Area | Routes |
|---|---|
| Gateway | `POST /api/gw/ingest` (packets as hex or `{hex, rssi}`), `POST /api/gw/heartbeat`, `GET /api/gw/time` |
| Sign-in (demo) | `GET /api/auth/demo-users`, `POST /api/auth/login` · `GET /api/me` |
| Requests | `GET /api/queue` · `POST /api/cases/{id}/open` (reason) · `GET /api/cases/{id}` · `POST …/call` (when, where) · `…/talked` · `…/handover` · `…/ack` ("I'm going") · `…/reached` · `GET …/verify` |
| SOS | `GET /api/sos/active` (with live location) · `GET /api/sos/history` |
| Counsellor | `GET /api/patterns` · `POST /api/students/{id}/open` · `GET /api/students/{id}` · `POST …/call` · `POST …/inform-parent` |
| Teacher / class | `GET /api/class/{id}/mood` · `GET /api/class/{id}/timetable` · `POST /api/activities/{id}/done` |
| Principal | `GET /api/reports/response` (+ `.csv`) · `GET /api/gateways` (map and bands) |
| Parent | `GET /api/parent/home` · `POST /api/parent/consent` |
| Model | `GET /api/model/card` · `GET /api/model/suggest?band=` |
| Live | `GET /api/events` (server-sent events) |
| Demo only | `GET/POST /api/demo/clock` · `POST /api/demo/reset` · `GET /api/demo/bands` · `GET /api/demo/band-inbox` |

## 9. Security summary

AES-CCM packets with a rotating id; replay and forgery rejected; receipts only the server can sign; exactly-once from many gateways (`UNIQUE(band_id, counter)` and a per-band row lock); row-level security between schools; append-only hash-chained history; AES-256-GCM encryption at rest with a per-school key wrapped by a master key; every staff read logged with a reason; location only during SOS; gateways authenticated by token (stored hashed). **Demo settings are not production settings:** keys derive from fixed strings, sign-in is a person picker, CORS is open. For a school: real secrets, `PP_DEMO_MODE=false`, HTTPS behind a reverse proxy, OIDC sign-in through the ERP.

## 10. Scale and performance

Planning assumptions (not measurements, except one): one school of 1,800 students makes about 36 requests a month and about 540 feeling check-ins a day; 500 schools is 900,000 students, about 18,000 requests a month and a peak of roughly 1,500 messages a second. **Measured in Round 3: 386 band messages per second** on a 2-vCPU machine with one API process. Up to about 50 schools: one database and two API servers; to about 500: a read copy and monthly partitions; beyond that, split by region. What breaks first is radio coverage in old buildings, not the server. Cost for one school: band under ₹1,000 (target), gateways ₹300–500 each or existing PCs, office root on UPS + 4G about ₹2,000–3,000.

## 11. Tests

- **Server:** `cd backend && python -m pytest -q` → **41 tests** on real PostgreSQL: 25 end-to-end rule tests, 9 HTTP permission tests, 7 protocol tests. They cover exactly-once from two gateways (including at the same instant), replay and forgery, a private single feeling, the 5-of-10-days rule (and not before), the reply clock moving up, Call to talk stopping it and reaching the band, SOS with a location that follows the child and "I'm going", SMS/call repeats with a daily cap, medical SOS, cancel, PT mode and the timetable, class weather hiding small groups, parents receiving no automatic alerts and encrypted messages, the silent-band notice, the model beating its baseline, tamper detection and row-level security.
- **In-browser engine:** `node web/tests/engine.test.mjs` → 17 tests of the same rules.
- **End to end:** `python tools/e2e_story.py <url>` plays the whole story in a real browser and checks each chapter's outcome through the API, against the live stack and against the in-browser engine.

## 12. Limitations

- **The band firmware is written, not compiled or tested on hardware.** No band hardware was available. The OLED shows English only; Hindi on the band needs a Devanagari bitmap font. The firmware's model and timetable are loaded from a gateway (characteristics defined, the gateway side of that sync is not written yet).
- The gateway's Bluetooth mode is written but untested; the prototype uses a simulated radio. Signal strength is simulated by the virtual band.
- SMS and calls are logged, not sent; push notifications are shown in the app; the ERP and timetable are sample data; sign-in is a person picker.
- The emotion model is trained and measured on **simulated** children only. It never decides anything.
- Class activities come from a reviewed library; an AI draft with a person approving is planned.
- Docker Compose is written, not run by us. The server and tests were run on Windows with an embedded PostgreSQL 16.
- Accessibility has not had a formal audit (keyboard use, live regions and reduced-motion support are built in).

## 13. Future development

A pilot in one school to measure real accuracy and false alarms; band hardware and a wall test for gateway coverage; the PRASUNEX ERP adapter (OIDC sign-in, rosters, timetable); a real SMS and push gateway; Devanagari on the band's screen; AI-drafted class activities with human approval; a school-level admin to shorten reply clocks; a formal accessibility and security review.
