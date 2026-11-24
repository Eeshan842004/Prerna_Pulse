# Prerana Pulse: material for the PPT

Team Monarch · PRASUNEX Innovathon 2026. Everything below is checked against the code in this repo. Where something is a target, a simulation or untested, it says so, because judges ask.

**How to use this file:** Part 1 is the story. Part 2 is the workflow and mechanism (use the two flowchart images). Parts 3 to 6 map to the four things teams are shortlisted on: **functionality, technical execution, usability, innovation**. Part 7 is a suggested slide order. Part 8 is honest limits and judge questions.

Images ready for slides: `docs/flowcharts/1_how_the_band_works.png`, `docs/flowcharts/2_teachers_and_counsellors_in_the_loop.png`. Video: `docs/Prerana_Pulse_v2_walkthrough.mp4` (7 min: both flowcharts, then the full live story).

---

## 1. The one-minute story

**Tagline:** *A phone-free way for any student to ask for help, and a reply the school can't ignore.*

**Problem (with sources, as in our Round 2 deck)**
- 13,892 Indian students died by suicide in 2023, the highest in ten years (8,032 in 2014). Source: NCRB, ADSI 2023.
- Many schools ban phones (Himachal Pradesh from 1 March 2026); only 36% of rural boys and 27% of rural girls aged 14–16 own a smartphone. Source: ASER 2024.
- Reports sometimes get no help at all (NBC News, 2023). In July 2025 the Supreme Court told schools to set up confidential reporting and counselling (Sukdeb Saha v. State of A.P.). UMMEED asks every school for a wellness team; CBSE asks for one counsellor per 500 students.

**Three root problems and our answer to each**

| Problem | Our answer |
|---|---|
| Children stay silent: shame, fear parents will be told, no words for the feeling | The band asks first, privately. The child just picks a word. Parents hear only from the counsellor, never automatically. |
| They can't use a phone (banned or not owned), and a shared screen isn't private | Band only. No phone, no tablet, nothing typed in class. |
| Reports go unanswered, and nobody sees the silence | Every request has an owner and a deadline. Silence moves it up on its own. The principal sees response times. |

**One-line product:** a wristband that notices when a child is tense, quietly asks how they feel, helps them calm down, gets help fast in danger, and makes sure an adult always answers.

**Positioning:** safety first, wellbeing built in. Not a mood tracker, and not only a panic button.

---

## 2. The full workflow and how it works

### 2.1 The five parts of the platform

| Part | What it is | Built as |
|---|---|---|
| **Pulse Band** | Wristband, one button, small round screen, vibration motor, heart-rate and motion sensors | Virtual band (browser) with the exact logic the firmware will run. Firmware v2 (OLED menu, exercises, PT mode, SOS beacon, on-band model) written for ESP32-C3, **not compiled or tested** (no hardware this round). |
| **Gateways** | Bluetooth in, HTTPS out. Existing school PCs or ₹300–500 ESP32 hubs. Each has a known place on the school map. | `gateway/gateway.py` (offline queue, heartbeats, signal strength). Bluetooth mode written, untested. |
| **School server** | Checks messages, keeps exactly one copy, runs reply clocks, SOS, rules, the per-child model, audit | FastAPI + PostgreSQL 16 (row-level security, timers and outbox in the database) |
| **Adult app** | One simple phone app, four roles: teacher, counsellor, principal, parent. English and Hindi. | Web app (PWA-ready), same code runs against the server or an in-browser copy of it |
| **ERP link** | Names, rosters and the timetable come from the school ERP | Adapter plus a mock ERP (PRASUNEX API access needed for the real one) |

### 2.2 The child's journey on the band (use flowchart 1)

1. **Learn (first 2 weeks):** no buzzes. The band records the child's own resting heart rate for morning, midday and afternoon.
2. **Notice:** the band asks only when ALL of these are true: heart rate at least 20% above her own normal for that time of day · for 2 minutes · sitting still for 5 minutes (motion sensor) · not in PT mode or a PT period · fewer than 3 questions today · sensing not paused by her health profile.
3. **Ask privately:** 3 soft pulses only she feels. The screen shows "How are you?" with the likely feeling first (marked ★). She taps to scroll and holds 1 second to choose. No answer: it asks again in 10 minutes, then logs "skipped".
4. **She names the feeling.** Menu: I'm fine · Worried · Sad · Angry · Scared · Stressed · Jealous · Left out · Unwell · Just active / PT · Talk to someone · I'm in danger. English and Hindi, with icons.
5. **A matching 1-minute exercise runs on the wrist** (box breathing, 3 good things, 4–6 breathing with a squeeze-and-release, 5-4-3-2-1 grounding, a calm-down, "name it and one kind thought", slow breathing). Gentle pulses guide the rhythm. At the end: "Feel better?" Tap = yes, hold = talk to someone.
6. **Private by default.** One feeling on one day tells nobody anything.
7. **Always available:** double tap opens the menu herself; hold 5 s then tap = SOS; PT mode for sports.

**One button, one grammar:** tap = next word · hold 1 s = choose · double tap = open menu · hold 5 s = SOS · hold 2 s within 60 s = cancel SOS.

**Vibration language:** 1 short buzz = the school has it (signed receipt verified) · 2 short = not delivered yet, still trying · 3 soft = "How are you?" · slow rhythm = breathe along · 1 long = confirm SOS · 2 long = a message from an adult.

### 2.3 How the adults stay in the loop (use flowchart 2)

**Feelings (privacy first)**
- A single feeling: private, exercise only.
- The **same difficult feeling on 5 of the last 10 school days** → the counsellor gets a note **with the name**: "Riya chose *sad* on 5 of 10 days. Consider a check-in." Never a diagnosis. One nudge per child per 14 days.
- The counsellor opens the child's page (a reason is required and logged), sees the 14-day feelings row, and can **Call to talk** or **Inform parent** (a note the counsellor chooses to share, stored encrypted).
- **Class weather, no names:** if a class's share of difficult feelings is at least 2× the school median for 3 school days, the class teacher gets a 10-minute activity chosen by the class's top feeling. Any group under 10 answers is hidden.

**Talk to someone and the reply clock**
1. Child: Talk to someone → My adult (her chosen teacher) or Counsellor. One buzz = delivered.
2. The chosen teacher gets "Respond by 3:30 pm". Reminders at 50% and 80% of the time.
3. The adult responds by **Call to talk**: quick chips for when (now · next break · lunch · after school) and where (counselling room · staff room · room 12). The band shows "Ms Khan will see you at lunch, Room 12". **Only this real response stops the clock. Opening the message does not.**
4. The child holds Okay on the band; the adult sees "Riya saw it ✓". They talk in person, then mark Talked ✓ or Needs counsellor.
5. **No response in time → it moves up on its own:** chosen teacher → counsellor (by 12:00 next school day) → principal (by 4:00 pm next school day) → management flag. The previous adult is told it moved on; the child's band says "Ms Khan will contact you". Schools can shorten these clocks, never lengthen them.
6. A report about a staff member goes to the principal and POCSO officer only; that person's own chain never sees it.

**SOS with live location**
1. Hold 5 s, then tap to confirm (or Unwell → Need the nurse? → hold). A 60-second cancel exists.
2. **Alerted at once:** counsellor, principal and the child's class teacher (nurse added for medical SOS or a health flag; POCSO officer optional).
3. **Where she is:** every gateway that hears her band reports signal strength; the strongest recent one is shown on a school map ("near Block A stairs · 20 s ago") and the pin follows her as she moves. Room or corridor level only, only during an SOS, only inside school, only to the SOS recipients. No GPS.
4. First adult taps "I'm going": others see who, and her band shows "Ms Khan is coming".
5. No one goes in 10 minutes → SMS and a call task to everyone, every 10 minutes, until someone does (with a daily cap on repeats; the SOS itself is never dropped).

**Silence is a signal:** 3 questions skipped in a row → quiet note to her chosen teacher. Band silent a whole school day → class teacher is told to check battery or fit.

**PT / sports mode:** child sets 30/45/60 minutes, or the ERP timetable pauses sensing in PT, games, yoga and dance periods. The band never needs to come off. SOS still works.

**Principal:** response report (counts only): on-time %, median time to respond, moved up, SOS count and time to go, unanswered. CSV and print view, with the line "Basis: Sukdeb Saha v. State of A.P., 25 Jul 2025". Plus device health: which gateway went quiet, which bands to charge tonight.

**Parent:** consent switches (sensing on/off, feelings visible to the counsellor on/off, health note, language), band status (worn today, battery), and only the messages the counsellor chooses to share. **No automatic alerts, no daily feelings.**

### 2.4 What happens behind the scenes (one message, end to end)

`band → 19 encrypted bytes (Bluetooth) → any gateway in range → HTTPS (port 443) → server verifies, keeps ONE copy, applies the rule → server signs a receipt with that band's own key → band buzzes once`

- A gateway that hears the band also reports the signal strength (used for SOS location).
- Two gateways hearing one press produce one record (unique on band + counter).
- The receipt is signed only **after** the database commit, so one buzz always means the school really has it.
- Timers live in PostgreSQL next to the case and are claimed with `FOR UPDATE SKIP LOCKED`; alerts leave through an outbox table, so a crash can repeat an alert but never lose one.

---

## 3. Functionality (what works, with evidence)

| Feature | Status |
|---|---|
| Band: learn, notice (all 6 conditions), private ask, feelings menu with ★ suggestion, 7 matched exercises, ask-again-in-10-min, skipped logging, max 3 questions/day | Built and demonstrated (virtual band) |
| One-button grammar: tap, hold, double tap, 5 s SOS, 2 s cancel | Built |
| Junior mode (classes 3–5): 6-item menu | Built |
| Talk to someone, reply clock, auto move-up, reminders at 50%/80%, school calendar (Mon–Sat, Asia/Kolkata) | Built and tested |
| Call to talk → message on the band (max 60 chars) → "Riya saw it ✓" | Built and tested |
| SOS: multi-person alert, live location from signal strength, trail, "I'm going", SMS+call repeat with daily cap, cancel within 60 s, medical SOS | Built and tested |
| 5-of-10-days rule with name; goes-quiet; band-silent; class tension | Built and tested |
| PT mode (child-set and timetable) | Built and tested |
| Class weather with k ≥ 10 hiding, activity suggestion, "Done in class" | Built and tested |
| Four adult apps (teacher, counsellor, principal, parent), English and Hindi, installable and working offline | Built |
| Response report with CSV/print; device health on the school map | Built and tested |
| Parent consent switches and encrypted counsellor messages | Built and tested |
| Reason required for every staff read; "who opened this" visible; tamper-evident history | Built and tested |

**Verification (all run on this machine, this week)**
- **Server tests:** automated backend tests against a real PostgreSQL 16 (end-to-end rule tests, HTTP permission tests, protocol tests; the exact count is in `README.md` and `docs/TECHNICAL.md`) and **17 tests of the in-browser engine**. Both cover the same rules.
- **End-to-end in a real browser:** `tools/e2e_story.py` plays the whole 7-chapter story and checks 12 outcomes through the API (the counsellor got the 5-of-10 note with the name; a teacher is blocked from feelings; the request moved up and Call to talk stopped the clock; the child's "Okay" came back; SOS reached three people and the location moved; the parent got only the counsellor's chosen message and no automatic alerts). **It passes against the live FastAPI + PostgreSQL stack with real gateway processes, and against the in-browser engine.**
- **Edge cases checked in the browser (27 checks):** junior band (6-item menu, no PT or danger item), Unwell → "Need the nurse?" → medical SOS reaching the nurse, three SOS at once, every adult screen in Hindi, and nine phone-size screens with no sideways scrolling. A child with no chosen adult still gets an answer from the counsellor (server test).
- **Offline:** installable (web manifest and service worker); with the network off, the story and Try-it still run and the flowcharts are cached.
- **Accessibility (own checks, not a formal audit):** every button has a name, no missing image text, visible keyboard focus on every control, live regions announce band events, 44 px tap targets on the main controls. An automated axe-core audit was **not** run.

**Three ways to demo it:** (1) *Watch the story*: a 7-chapter guided walkthrough that plays itself slowly with a cursor, coloured clicks, arrows and a steps list; (2) *Try it yourself*: the real band and any adult's phone, with a task checklist that ticks itself; (3) *Under the hood*: for technical judges.

---

## 4. Technical execution (what is technically strong)

**Security and trust (a real strength: say it plainly)**
- **19-byte AES-CCM packets**, 8-byte authentication tag; the header is authenticated; the message type is encrypted, so a gateway can relay bytes it cannot read.
- **Rotating ID every 15 minutes** (HMAC of the band key): nobody can follow a child around school by Bluetooth.
- **Replay protection** (counter must go up) and **forgery rejected** (any flipped bit fails). Tested.
- **Receipts a gateway cannot fake:** signed with the band's own key; only the server holds it. A band buzzes once only for a valid receipt.
- **Exactly-once:** two gateways, one record. Tested even when both forward at the same instant.
- **Row-level security** (FORCE ROW LEVEL SECURITY) on every tenant table; the API connects as a role that cannot bypass it. One school can never read another's data. Tested.
- **Append-only, hash-chained history** per case; an update or delete is blocked by a database trigger, and tampering is detected. Tested.
- **Encryption at rest** (AES-256-GCM, per-school key wrapped by a master key) for counsellor-to-parent messages.
- **Privacy by design:** only the child's choices leave the band, never raw heart data; students are stored by ERP reference, names come from the ERP at display time; every staff read needs a reason the child's side can audit; location only during an SOS.

**Reliability by design**
- Gateways queue messages on disk if the internet fails and forward them in order later; heartbeats show "No gateway heard since 8:35 am".
- Timers and alerts survive a crash (database timers + outbox).
- If a band's delivery fails it keeps retrying (back-off) and buzzes twice to tell the child.

**Architecture choices (and what we rejected, a good slide)**
- PostgreSQL only (timers, outbox, RLS in one place). Rejected: Redis (safety timers shouldn't live in a cache), MQTT (one more server; HTTPS passes school firewalls), LoRaWAN (about ₹14 lakh per school), Wi-Fi/SIM in the band (fees, battery, phone-like), GPS in the band (fails indoors, power-hungry; gateways give room-level location for free), voice on the band (cost, and speaking in class isn't private).
- One code base: the same web app runs against the FastAPI server or against an in-browser copy of the server rules, so the demo works with no install.

**Scale (planning assumptions, not measurements, except one)**
- Measured in Round 3: **386 band messages per second** on one 2-vCPU machine with one API process.
- Assumptions: one school of 1,800 students makes about 36 requests a month; 500 schools is 900,000 students, 18,000 new requests a month, about 1,500 messages/s at peak. Up to about 50 schools: one database and two API servers; beyond that, a read copy and monthly partitions; beyond that, split by region.
- What breaks first is radio coverage in old buildings, not the server.

**Cost for one school:** band under ₹1,000 (target, in the school kit; the small screen adds about ₹150–250) · gateways ₹300–500 each or existing PCs · office root on UPS + 4G about ₹2,000–3,000.

---

## 5. Usability (designed for a 12-year-old and a busy teacher)

- **One button, no phone.** A child does everything with one button on her wrist: nothing typed, nothing said aloud, nobody sees her screen.
- **Words, not scores.** Feelings are shown as words with a small icon, in English and Hindi, each with a one-line meaning and a matched exercise. This teaches emotional vocabulary.
- **Plain teacher words.** "Respond by 3:30 pm · 4 h left", "Moved up because no one responded", "History can't be changed ✓". No jargon on any normal screen.
- **One job per screen, at most three action cards**, one primary button per card, big tap targets (48 px and up).
- **Always who and when:** every request shows who has it and by when.
- **Calm colours, red only for SOS.** Purple brand, green done, amber time running out.
- **Bilingual** English / हिन्दी, switchable live, including during the demo.
- **Helplines on every screen:** Childline 1098 · Emergency 112 · Tele-MANAS 14416.
- **Kind tone:** "Thank you for telling us." No red badges on anything the child sees.
- **Built-in guidance in the demo:** a "What to do" box above the watch always says the next action; the Try-it checklist ticks itself; the story shows a coloured arrow on whatever is happening, a steps list and a "What just happened" log.
- **Accessibility intent:** keyboard-operable controls, live-region announcements for band events, reduced-motion support. (A formal Lighthouse audit has not been run yet.)

---

## 6. Innovation (what is new, and what we can honestly claim)

1. **The band asks first, privately.** The child doesn't have to start the conversation. A vibration only she feels, then a list of feeling words.
2. **A personal emotion model that only orders the menu.** A tiny per-child Naive Bayes model learns from her own confirmed choices (time of day, weekday, current period, size of heart-rate rise, movement) and puts her likely feeling first. She always confirms. It runs on the band and on the server, learns online, and borrows a school-wide prior so new children get sensible suggestions on day one.
   - Honest numbers, measured on simulated children the settings were never tuned on, predicting each choice before seeing it: right first time about **47–49%** vs about **45–47%** for "most common feeling" and right feeling in the first three about **71–72%** vs about **67%**. A real but modest gain; real accuracy needs a pilot.
3. **A matching exercise on the wrist for every feeling**, done privately, so the band builds emotional skills, not just alerts.
4. **A reply the school can't ignore:** auto-escalation that only a real response stops, and the response is a human one (a call to a room), not a tick box.
5. **SOS with live in-school location without GPS**, from gateway signal strength.
6. **Private by default, reported when it matters:** one bad day stays private; the same difficult feeling on 5 of 10 days reaches the counsellor.
7. **PT mode and timetable auto-pause:** removes the biggest false-alarm source without taking the band off.
8. **Class weather with no names** and a 10-minute activity, instead of a list of children.
9. **Built for Indian law and schools:** Supreme Court 2025 guidelines (confidential reporting, counselling, a response report), POCSO path, DPDP Act consent with parent switches, UMMEED wellness team; works where phones are banned and tablets don't exist; ERP add-on.
10. **Trust you can verify:** receipts gateways can't fake, IDs that change every 15 minutes, every read logged with a reason, history nobody can edit.

**Competitors (Round 2, public pages checked 6 and 13 Nov 2026; "Not found" means we didn't see it, not that it doesn't exist)**

| Capability | Linewize Pulse | Microsoft Reflect | Mightier | Gökyuva | STOPit | **Prerana Pulse** |
|---|---|---|---|---|---|---|
| Child picks the adult | Yes | No | No | Yes | Not found | **Yes** |
| Reply clock, auto-escalation | Not found | No | No | Yes | Partly | **Yes** |
| Teaches feeling words | Not found | Yes | Not found | Not found | Not found | **Yes** |
| Heart-rate band | No | No | At home | No | No | **In school** |
| No student phone needed | Not found | Yes | No | Not found | Not found | **Yes** |
| Built for Indian law | No | No | No | No | No | **Yes** |
| Inside a school ERP | No | Partly | No | No | No | **As a module** |
| SOS with in-school location | not found in this set | | | | | **Yes** |
| Personal feeling suggestion + exercise on the wrist | not found in this set | | | | | **Yes** |

---

## 7. Suggested slide order (10–12 slides)

1. **Title:** Prerana Pulse, tagline, team.
2. **The problem:** the three numbers and the three root problems.
3. **Our idea in one picture:** band → gateway → server → teacher / counsellor / principal / parent. Add the sentence "no phone, no tablet".
4. **How the band works:** flowchart 1.
5. **Adults stay in the loop:** flowchart 2.
6. **Live demo / video:** the story, or the 7-minute walkthrough video. (Say what the audience will see: Riya's watch on the left, an adult's phone on the right.)
7. **Functionality:** the feature table in Part 3 (pick 8 rows) and "41 + 17 automated tests".
8. **Technical execution:** the security list and the architecture-choices-and-rejections slide.
9. **Usability:** one button, words not scores, Hindi, helplines, a screenshot of the watch and of the teacher's "1 child wants to talk to you" card.
10. **Innovation:** the emotion-suggestion model with its honest numbers, SOS location from signal strength, PT mode, class weather.
11. **Impact and scale:** cost per school, the measured 386 msg/s, the scale table, the ERP add-on model.
12. **What's real vs simulated, and next steps:** Part 8.

---

## 8. Honest limits (put one slide on this; it builds trust) and likely judge questions

**Built and tested:** the rules, the protocol and receipts, the gateway program, the virtual band, the emotion model (on simulated children), the four adult apps, the FastAPI + PostgreSQL server.

**Simulated:** SMS and calls (logged, not sent); the school ERP and timetable (sample data); push notifications (shown in the app); signal strength (set by the "Where is she?" control on the virtual band); sign-in (a demo person picker); class activities (a reviewed library; planned: AI drafts, a person approves).

**Written, not tested:** the band firmware (no hardware this round), the gateway's Bluetooth mode, Docker Compose.

**Targets, not measurements:** 95% of presses confirmed within 3 s; SOS location shown within 10 s of the press on real radios; band cost under ₹1,000.

**Never claimed:** that the band detects emotions, diagnoses, detects emergencies, or that AI decides anything. Wording to use: *"The band notices a change; the child names the feeling. A small model learns each child's patterns to suggest the likely word first."*

**Next steps:** a pilot in one school (to measure real accuracy and false alarms), building the band hardware and a wall test for gateway coverage, the PRASUNEX ERP adapter, a real SMS gateway, a formal accessibility audit.

**Questions judges may ask**
- *Does it detect emotions?* No. It notices a change in heart rate while she is still, and asks. She names the feeling.
- *What about PE or running?* PT mode (child-set or timetable) pauses asking; the motion sensor stops questions while moving; "Just active" tunes the threshold. SOS always works.
- *What stops a prank SOS?* Hold 5 s plus a confirming tap, a 60-second cancel, a daily cap on SMS repeats, and a first misuse is a talk, not a penalty.
- *Why would a teacher answer?* The deadline is visible; silence moves it to the counsellor and principal; the principal's report shows on-time rates.
- *Is this tracking children?* No. Location only during an SOS, only inside school, room level, only to SOS recipients.
- *Can the school snoop?* Every staff read needs a reason; the child's side can see who opened what; history can't be edited; class data has no names and hides small groups; parents control consent.
- *Why not an app?* Many children have no phone at school, and a shared screen isn't private. One button on the wrist is private and always there.
- *Will it scale?* Measured 386 messages/s on one small machine; the design adds API servers and a read copy; radio coverage in old buildings is the real risk.
