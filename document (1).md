# Prerana Pulse: complete project specification (band-first, v2)

Team Monarch · PRASUNEX Innovathon 2026 · Round 3 (due 25 Nov) and Grand Finale (1 Dec)

This is the single source of truth for the project. It replaces every earlier version.

**The big change from v1:** there is **no class tablet**. The child uses **only the band**. Adults use a simple phone app:
- teacher
- counsellor
- principal
- parent

Section 19 is a ready-to-paste prompt for Claude Code.

---

## 0. Contents

1. The product in one page
2. Problem statement
3. What changed since Round 2, and why
4. Who is connected
5. USPs
6. The band: every interaction
7. Feelings, exercises and the emotion model (ML)
8. Talk to someone, and the reply clock
9. SOS with live location
10. PT / sports mode and the school timetable
11. Rules: what gets reported, to whom
12. The adult apps: screen by screen
13. The demo: Story Mode
14. System design: architecture, protocol, data model, APIs, security
15. Scale, cost, feasibility
16. Design system and UX rules
17. Build plan and acceptance checklist
18. Honesty rules
19. Prompt for Claude Code

---

## 1. The product in one page

**Name:** Prerana Pulse

**Tagline:** *A phone-free way for any student to ask for help, and a reply the school can't ignore.*

**In one line:** a wristband that notices when a child is tense and quietly asks how they feel, helps them calm down, gets help fast in danger, and makes sure an adult always answers.

**How it works for a child (Riya, Class 7B):**
1. Riya is sitting in Maths. Her heart rate stays clearly above her normal for a few minutes while she is still.
2. The band gives a small vibration that **only she feels**.
3. Its small screen shows **"How are you?"** and a list of feeling words. The word the model thinks is most likely for her comes first, for example **Worried**. She taps to move through the list and holds to choose.
4. She picks **Worried**. The band guides a **1-minute breathing exercise** with gentle pulses. Nobody is told. One worried day is private.
5. If Riya picks **Sad** on 5 of the last 10 school days, the **counsellor** gets a note with her name: *"Riya has chosen 'sad' on 5 days. Consider a check-in."*
6. If she chooses **Talk to someone**, her chosen adult (or the counsellor) gets a request with a deadline. They **call her to a room** to talk in person. The band shows: *"Ms Khan will see you at 12:30, Room 12."*
7. If she is **in danger**, she holds the button for 5 seconds and confirms. This is **SOS**: the counsellor, principal and class teacher are alerted at once, with **her live location in school** (from the nearest gateway).
8. If it's her **PT period**, she sets **"PT: 30 min"** on the band, or the school timetable does it automatically. The band stops noticing while she runs.

**Positioning:** **Safety first, wellbeing built in.** The band is a safety band (SOS with location, a guaranteed reply). It also builds emotional intelligence:
- children learn to name feelings
- they get a matching exercise
- the school sees patterns early

**What a child never has to do:** own a phone, type on a shared screen, say it out loud in class, or tell their parents before anyone else.

**Domains:** EdTech & Smart Education · AI & ML · Social Impact

---

## 2. Problem statement

**Headline:** *Children carry it alone, and schools find out too late.*

| Fact (as in our Round 2 deck) | Source |
|---|---|
| 13,892 students in India died by suicide in 2023, the highest in ten years (8,032 in 2014). | NCRB, ADSI 2023 |
| Many schools ban phones (Himachal Pradesh from 1 March 2026); only 36% of rural boys and 27% of rural girls aged 14–16 own a smartphone. | ASER 2024 |
| Report apps exist abroad, but students say some reports got no help at all. | NBC News (2023) |
| July 2025: the Supreme Court told schools to set up confidential reporting and counselling. | Sukdeb Saha v. State of A.P., 25 Jul 2025 |
| UMMEED asks every school to run a wellness team; CBSE asks for one counsellor per 500 students. | MoE UMMEED, CBSE |

**Root problems and our answers:**

| Problem | Our answer |
|---|---|
| **They stay silent:** fear parents will be told, shame, no words for the feeling | The band asks first, privately. The child just picks a word. Feeling words are taught. Parents hear from the counsellor, never through an automatic alert. |
| **They can't use a phone:** banned or not owned | Band only. Most schools have no tablets either, so we need none. |
| **A shared screen isn't private:** classmates see who types | Nothing is typed in class. Everything happens on the child's own wrist. |
| **In danger, every second counts** | Hold 5 s + confirm: SOS with live location in school. |
| **Reports go unanswered:** a report with no reply teaches a child not to ask again | Every request has an owner and a deadline. Silence moves it up automatically. |

---

## 3. What changed since Round 2, and why

| Round 2 said | Now | Why |
|---|---|---|
| "Name the feeling later on the tablet" | **Name the feeling on the band**, right away | Most schools have no tablets, and a shared screen isn't private |
| Band answers: 1 okay · 2 not great · 3 talk | **A word menu on a small band screen**: feelings, Talk to someone, PT mode, I'm fine | Children can say *what* they feel, not just okay / not okay |
| Calm-down buzz for "not great" | **A matching 1-minute exercise for each feeling** | Builds emotional skills, not just a buzz |
| Help now: hold 5 s, then confirm | **Same gesture, now with live location** from the nearest gateway | Adults need to know *where*, not just *who* |
| Tablet / portal as another way to ask | **Removed.** The band is the only child device | Privacy and cost |
| "Simple statistics on the band" | Same statistics for noticing, **plus a small per-child model that suggests the likely feeling first** | The model only orders the menu; the child confirms |
| (not in Round 2) | **PT / sports mode** and timetable auto-pause | Stops false alarms without taking the band off |

Kept from Round 2:
- the reply clock and escalation
- the child choosing their adult
- "silence is a signal"
- class view with no names
- the principal's response report
- receipts gateways can't fake
- IDs that change every 15 minutes
- PostgreSQL only
- an ERP module
- helplines on every screen

---

## 4. Who is connected

| Who | Device | What they do | What they see |
|---|---|---|---|
| **Student** | **Band only** | Picks feelings, does exercises, asks to talk, SOS, PT mode, reads short replies on the band | Their band screen |
| **Teacher** (and the chosen adult) | Phone app (PWA) | Replies to children who chose them by calling them for a talk; sees class mood; runs a 10-minute class activity | Requests from children who chose them; class mood with no names; SOS for their class |
| **Counsellor** | Phone / laptop | Handles SOS and talk requests, and checks in when a pattern is reported | Urgent-first list; SOS with location; pattern notes **with names**; each child's 14-day feelings (with consent) |
| **Principal** | Phone / laptop | Stays in the loop and ensures the school answers | SOS with location; requests nobody answered in time; the response report; device health |
| **Parent** | Phone app | Gives consent and hears from the counsellor | Consent switches; band status (charged, worn); messages the counsellor chooses to share. **No automatic alerts, no daily feelings.** |

**Behind the scenes (no separate app needed):**
- **Nurse:** added to SOS when the child chose "Unwell" or when their health profile says so.
- **POCSO officer:** the school can add them to SOS and to requests about staff.
- **Management:** gets a flag only if nobody answered at any level.
- **IT person:** uses the principal's Devices tab.

---

## 5. USPs

1. **The band asks first, privately.** A small vibration only the child feels. The child doesn't have to start the conversation.
2. **Phone-free and tablet-free.** Works in Indian schools where phones are banned and tablets don't exist.
3. **The child names the feeling, in words.** The menu shows *Angry, Sad, Worried, Scared, Stressed, Jealous, Left out, Unwell*. This teaches emotional vocabulary (English and Hindi).
4. **A personal emotion model.** It learns each child's own patterns (time, period, heart-rate rise, movement) to put their likely feeling first. The child always confirms; the model never decides.
5. **A matching exercise for every feeling.** Breathing for anger, grounding for fear, a 1-minute calm-down for stress. It's done on the wrist, privately.
6. **Private by default, reported only when it matters.** One bad day stays private. The same difficult feeling on 5 of 10 school days goes to the counsellor, with the name.
7. **SOS with live location in school.** Hold 5 s + confirm. The nearest gateway tells adults where the child is ("near Block A stairs") and updates as they move. No GPS needed.
8. **A reply the school can't ignore.** Every request has an owner and a deadline. No reply moves it up: chosen adult → counsellor → principal → management. Only a real response stops the clock.
9. **Talk in person, not on a screen.** The adult calls the child to a room, and the band shows the time and place.
10. **PT mode.** Sensing pauses for sports, set by the child or by the timetable, so the band never needs to come off.
11. **The child chooses the adult.** Trust over hierarchy.
12. **Silence is a signal.** Questions skipped 3 times in a row, or a band silent all day, gets a quiet note to an adult.
13. **Class view, no names.** Teachers see class mood (any group under 10 is hidden) and get a 10-minute activity, not a list of names.
14. **Built for Indian law:** Supreme Court 2025 guidelines, POCSO path, DPDP consent, UMMEED wellness team.
15. **Trust you can verify:**
    - only the child's choices leave the band, never raw heart data
    - receipts gateways can't fake
    - IDs that change every 15 minutes
    - every staff read logged with a reason
    - history nobody can edit
16. **Inside the school ERP.** A PRASUNEX ERP module with the same sign-in and rosters, sold as an add-on. The timetable comes from the ERP.
17. **Cheap.** Band under ₹1,000 target. Gateways are existing PCs or ₹300–500 ESP32 hubs. Office root on UPS + 4G.

**Competitor table (Round 2, public pages checked 6 and 13 Nov 2026; "Not found" means we didn't see it):**

| Capability | Linewize Pulse | Microsoft Reflect | Mightier | Gökyuva | STOPit | Prerana Pulse |
|---|---|---|---|---|---|---|
| Child picks the adult | Yes | No | No | Yes | Not found | Yes |
| Reply clock, auto-escalation | Not found | No | No | Yes | Partly | Yes |
| Teaches feeling words | Not found | Yes | Not found | Not found | Not found | Yes |
| Heart-rate band | No | No | At home | No | No | In school |
| No student phone needed | Not found | Yes | No | Not found | Not found | Yes |
| Built for Indian law | No | No | No | No | No | Yes |
| Inside a school ERP | No | Partly | No | No | No | As a module |

New rows we can add:
- SOS with in-school location: only Prerana Pulse in this set (as far as we found).
- Personal feeling suggestion + exercise on the wrist: only Prerana Pulse.

---

## 6. The band: every interaction

**Hardware:**
- ESP32-C3 (Bluetooth 5, AES in hardware)
- MAX30102 heart-rate sensor
- MPU6050 motion sensor
- **0.96" OLED screen (128×64)**
- vibration motor
- **one button**
- small LiPo battery, charged at home each night

Target under ₹1,000 at scale.

**One button, simple grammar** (the same everywhere):

| Action | Meaning |
|---|---|
| **Tap** | Next item / wake the screen |
| **Hold 1 s** | Choose the item shown |
| **Double tap** (when idle) | Open the menu yourself (child-initiated) |
| **Hold 5 s** | SOS. The screen asks "Send SOS? Tap to confirm" |
| **Hold 2 s within 60 s after SOS** | Cancel SOS |

### 6.1 Noticing (the band asks)

**Learn → Notice → Tune → Reset:**
- **Learn (weeks 1–2):** no buzzes. Records resting heart rate when still, at different times of day.
- **Notice:** asks only when **all** are true:
  - heart rate at least **20% above this child's normal for that time of day**
  - for **2 minutes**
  - **still, with no movement in the last 5 minutes** (motion sensor)
  - **not in PT mode or a PT period**
  - **fewer than 3 questions today**
  - sensing not paused by the health profile
- **Tune:** "I'm fine" or "Just active" raises the threshold a little; difficult feelings keep it.
- **Reset:** relearns every term.

**The question:**
- a small vibration (3 soft pulses) that only the child feels
- the screen shows "How are you?" and the first menu item (the model's suggestion), marked with a small ★
- **No answer:** asks again in **10 minutes**; still no answer is logged as **skipped**
- **3 skipped in a row:** a quiet note to the chosen adult

### 6.2 The menu (in this order, after the suggested item)

| # | Item (EN / HI) | What happens |
|---|---|---|
| ★ | *Suggested feeling* (from the model) | Shown first |
| 1 | **I'm fine** / मैं ठीक हूँ | Logged; threshold tuned up; no exercise |
| 2 | **Worried** / चिंतित | Exercise: box breathing (1 min) |
| 3 | **Sad** / उदास | Exercise: "3 good things" + slow breathing |
| 4 | **Angry** / गुस्सा | Exercise: 4–6 breathing with buzz rhythm, then a "squeeze and release" |
| 5 | **Scared** / डर लग रहा है | Exercise: 5-4-3-2-1 grounding |
| 6 | **Stressed** / तनाव | Exercise: 1-minute calm-down |
| 7 | **Jealous** / जलन | Exercise: "name it, breathe, one kind thought" |
| 8 | **Left out** / अकेला / अलग-थलग | Exercise: slow breathing + "you can talk to someone" offer |
| 9 | **Unwell** / तबीयत ठीक नहीं | Asks "Need the nurse?" Hold = yes: **SOS to the nurse + counsellor with location**. Tap = no: logged. |
| 10 | **Just active / PT** / अभी दौड़ा / पीटी | Logged as a false alarm (tunes the threshold); offers "PT mode 30 min?" |
| 11 | **Talk to someone** / किसी से बात करनी है | Sub-menu: **My adult (Ms Mehta)** · **Counsellor** → request with reply clock (§8) |
| 12 | **I'm in danger** / मैं खतरे में हूँ | Goes straight to SOS confirm (§9) |

**Junior mode (classes 3–5):**
- only 6 items: Happy/Fine, Sad, Angry, Scared, Unwell, Talk
- big icons with the word
- the same gestures

### 6.3 After choosing a feeling

1. The screen says: "Let's breathe together".
2. The vibration guides the rhythm.
3. A timer ring runs (about 60 s).
4. At the end: "Feel better?"
   - **Tap** = yes (logged).
   - **Hold** = "Talk to someone".

### 6.4 Short messages on the band

When an adult responds, the band gives **2 long pulses** and shows a short message, for example *"Ms Khan will see you at 12:30, Room 12"*.
- **Hold** = "Okay" (the adult sees "Riya saw it ✓").
- Messages are short (max 60 characters) and come from adult-side quick choices.

### 6.5 Delivery feedback

| Buzz | Meaning |
|---|---|
| 1 short | Delivered: the school's server has it (receipt verified) |
| 2 short | Not delivered yet, still trying |
| 3 soft | The band is asking "How are you?" |
| Slow rhythm | Exercise / breathing |
| 1 long | Confirm SOS: tap once |
| 2 long | A message from an adult is waiting |

---

## 7. Feelings, exercises and the emotion model (ML)

### 7.1 Feeling words (emotional intelligence)

- Every feeling has the word in English and Hindi, a small icon, a one-line meaning and a matched exercise (§6.2).
- **"Feeling of the week"**: the class teacher's app shows one feeling to talk about in 2 minutes at assembly or the start of class, with a short script. This is how feeling words are taught to the whole class.

### 7.2 The emotion suggestion model ("Prerana AI on the band")

**What it does:**
- It predicts the **most likely feeling for this child right now** and puts it **first** in the menu, marked ★.
- **The child always confirms.** We never claim the band detects emotions; heart rate shows that something is up, and the child names it.

**Inputs (context features):**

| Feature | Values |
|---|---|
| Time of day | morning / mid / afternoon |
| Day of week | |
| Current period from the ERP timetable | e.g. Maths, Science, after lunch, exam day |
| Size of the heart-rate rise | 20–30%, 30–45%, 45%+ |
| Movement level in the last 5 min | still / light |
| Recent choices | last 3 |

**Model:**
- A **per-child Naive Bayes classifier** with Laplace smoothing.
- A **school-wide prior** helps new children.
- It updates on every confirmed choice (online learning).
- It's tiny (a few hundred numbers per child), so it can **run on the band** (synced from the server each night) and on the server.
- Not a heavy deep-learning model.

**Honest evaluation:**
- Metric: **top-1 and top-3 accuracy** of the suggestion against the child's actual choice.
- Measured on simulated children in the prototype (seeded history with known habits), with a baseline of "most common feeling overall".
- Shown on a model card in "Under the hood".
- Real accuracy comes only from a pilot.

**Demo example:** Riya often picks *Worried* in Maths before tests, so in the Maths period the band suggests ★ Worried first. On a PT day with a big rise and movement, it suggests ★ Just active.

### 7.3 Feelings timeline (counsellor)

- A 14-day row per child (from band choices).
- Shown **only to the counsellor**, and only for children whose consent allows it, or when a rule has reported them.
- Teachers never see an individual child's feelings.

### 7.4 Class mood (no names)

- The class teacher sees **class weather** for the week:
  - ☀️ mostly fine
  - ⛅ mixed
  - 🌧️ many difficult feelings
  - ⛈️ class tension rule fired
- Plus the **top feelings this week** (words only, counts hidden).
- **Any group under 10 answers is hidden.**
- A **10-minute activity** is suggested when tension fires (Prerana AI; prototype = a reviewed library chosen by the top feeling).

---

## 8. Talk to someone, and the reply clock

1. **Request:** from the band ("Talk to someone" → My adult / Counsellor). The band buzzes once when the school has it.
2. **The adult responds in person.** In the app they tap **"Call to talk"**, pick a time and room (quick chips: *Now · Next break · Lunch · After school*; Room: *Counselling room · Staff room · Room 12*), and send. The band shows the message.
   - **That response stops the clock** (opening the request does not).
3. **After the talk:** the adult taps **"Talked ✓"** with an optional private note, or **"Needs counsellor"** to hand over.

**Reply clocks (defaults, schools can shorten, never lengthen):**

| Request to | First deadline | Then |
|---|---|---|
| Chosen adult | End of school day (3:30 pm, if at least 1 h is left; otherwise the next school day) | Counsellor by 12:00 next school day → Principal by 4:00 pm next school day → Management flag |
| Counsellor (direct) | End of school day | Principal → Management |

- Reminders at **50% and 80%** of the time.
- When it moves up, the previous adult is told; the child's band shows *"Ms Khan will contact you"*.
- School calendar: Asia/Kolkata, Mon–Sat, holidays.
- **Why it doesn't fail quietly:** timers in PostgreSQL, claimed with `SELECT … FOR UPDATE SKIP LOCKED`; an outbox, so a crash can repeat an alert but never lose one.

**About staff:** if a child's problem is a staff member, they choose **Counsellor**. The counsellor can route it to the principal / POCSO officer. That staff member's chain never sees it.

---

## 9. SOS with live location

**Trigger:**
- Hold 5 s → the screen shows "Send SOS? Tap to confirm" (1 long buzz) → tap → SOS sent.
- Also from the menu: **I'm in danger** → confirm.
- **Unwell → Need the nurse? → yes** sends a medical SOS (nurse + counsellor).

**Who is alerted at once:**
- counsellor, principal and the child's class teacher (the school can add the POCSO officer)
- **nurse** for medical SOS or a health-profile flag

**Live location, no GPS:**
- Each gateway has a known place (Classroom 7B corridor, Block A stairs, Library, Playground gate, Office).
- While SOS is active, the band **broadcasts every 5 s**.
- Every gateway that hears it reports the signal strength (RSSI).
- The server shows the **strongest recent gateway** as the location ("near Block A stairs · 20 s ago"), on a **simple school map**, and updates as the child moves.
- **Accuracy is room / corridor level.** No location outside school. **Location is only shared during an SOS**, never all day.

**Acknowledgement and repeats:**
- First adult taps **"I'm going"** → the others see who is going, and the child's band shows *"Ms Khan is coming"*.
- If nobody acknowledges in **10 minutes**: SMS + call task to all recipients, **every 10 minutes**, until acknowledged.
- After resolution: "Reached the child ✓" + a private note.

**Cancel:**
- the child holds 2 s within 60 s (adults see "Cancelled by child", and a quiet check-in later is suggested)

**Prank control:**
- hold-and-confirm
- 60 s cancel
- a daily cap on SMS/call repeats (SOS itself is never dropped)
- a first misuse means a talk, not a penalty

**Parents:** per our guidelines, parents are **not alerted automatically**. The counsellor informs them when it's safe and appropriate (logged).

---

## 10. PT / sports mode and the school timetable

- **The child sets it:** double tap → menu → **PT / sports** → choose **30 / 45 / 60 min**.
  - The screen shows "PT mode · 28 min left".
  - Noticing is paused. **SOS still works.**
  - Ends automatically.
- **The timetable sets it:** the ERP timetable marks PT, games, dance and yoga periods. Bands of that class pause noticing automatically during those periods.
  - The teacher app shows "7B: PT 11:20–12:00, sensing paused".
- **Just active:** if the band asks anyway, choosing *Just active / PT* tunes the threshold and offers PT mode.
- A **health profile** can pause sensing entirely (asthma, ADHD medicine, heart condition), as agreed with the parent and nurse.

---

## 11. Rules: what gets reported, to whom

| Rule | Trigger | Who hears | With name? |
|---|---|---|---|
| **One-off feelings** | Any single feeling, any day | **Nobody** (private; exercise only) | No |
| **Persistent feeling** | The **same difficult feeling** (sad, worried, scared, angry, stressed, left out, jealous) chosen on **5 of the last 10 school days** | **Counsellor**: "Riya has chosen *sad* on 5 days" | **Yes** |
| **Goes quiet** | 3 band questions skipped in a row | Chosen adult (quiet note) | Yes |
| **Band silent** | No contact for a whole school day | Class teacher (check the battery or fit) | Yes |
| **Class tension** | A class's share of difficult feelings is ≥ 2× the school median for 3 school days | Class teacher gets an activity | **No names** |
| **Unanswered** | Nobody responded at any level | Management flag + principal | Yes |

- One nudge per child per 14 days per rule.
- Every alert stores the rule name and version.
- **Rules are published to students and parents.**

---

## 12. The adult apps: screen by screen

**Common to all apps:**
- one simple phone-first app (PWA) with at most **3–4 bottom tabs**
- plain words
- big buttons
- English / हिन्दी toggle
- helplines on every screen: **Childline 1098 · Emergency 112 · Tele-MANAS 14416**

**SOS always appears as a red banner at the top of any screen** for its recipients, with location and an "I'm going" button.

### 12.1 Teacher (Ms Mehta: class teacher of 7B, chosen by Riya)

**Tabs:** Today · My class · Alerts

- **Today**
  - "**1 child wants to talk to you**"
  - a request card: photo/avatar, **Riya Sharma · 7B**, "asked on her band at 10:42", the countdown chip "**Respond by 3:30 pm · 4 h left**", and one button: **Call to talk**
  - **Call to talk** opens a sheet with quick chips (when + where), a preview of the band message ("Ms Mehta will see you at lunch, Room 12") and **Send to Riya's band**
  - after sending: "Sent ✓ · Riya saw it ✓"; later **Talked ✓** / **Needs counsellor**
  - opening needs a reason (preset chips); logged
- **My class**
  - class weather for 7B this week
  - top feelings (words only)
  - the timetable strip showing PT periods (sensing paused)
  - **Suggested 10-minute activity** card with steps + "Done in class"
  - **Feeling of the week** card
  - "No names are ever shown here"
- **Alerts**
  - quiet notes: "Aarav skipped 3 questions. Maybe say hi"; "Band 1007 silent today: check battery"
  - SOS history for the class

### 12.2 Counsellor (Ms Farah Khan)

**Tabs:** Urgent · Requests · Patterns · Alerts

- **Urgent:** SOS cards with a **school map**, the location pin, "20 s ago", who's going, and **I'm going**.
- **Requests**
  - talk requests (direct + moved up), sorted by deadline
  - each with a countdown and **Call to talk**
- **Patterns**
  - persistent-feeling notes **with names**: "Riya: *sad* on 5 of 10 days"
  - each note opens the child's **14-day feelings timeline** (words + small icons), **Call to talk** and **Inform parent** (a logged note of what was shared)
- **Child page**
  - feelings timeline, requests, SOS history
  - **Who opened this** (reasons)
  - consent status
- **Alerts:** everything else, in plain words.

### 12.3 Principal (Mr Suresh Iyer)

**Tabs:** Overview · SOS · Report · Devices

- **Overview:** 3 big numbers
  - **On-time responses %**
  - **Median time to respond**
  - **Open SOS** (0 = green)

  Plus "Unanswered at every level: 0".
- **SOS:** live and past SOS with map, who went, and time to reach.
- **Report:** the Supreme Court response report.
  - Counts only: requests by type, on-time %, median response, moved up, SOS count, median time to acknowledge.
  - Print / save PDF and CSV.
  - Basis line: Sukdeb Saha v. State of A.P., 25 Jul 2025.
- **Devices:** gateways as traffic lights on the school map ("No gateway heard since 8:35 am"), and bands to charge tonight.

### 12.4 Parent (Mrs Sunita Sharma, Riya's mother)

**Tabs:** Home · Settings

- **Home**
  - "Riya's band: worn today ✓ · battery 64% · charge tonight"
  - **Messages from the counsellor** (only what the counsellor chooses to share)
  - What Prerana Pulse never does:
    - no automatic alerts to parents
    - no raw heart data
    - never used for marks, discipline or ads
- **Settings (DPDP consent)**
  - Sensing on/off
  - Feelings visible to the counsellor on/off
  - Health profile notes (shared with the nurse)
  - Language

---

## 13. The demo: Story Mode

**Goal:** a judge understands everything in **5–6 minutes** with no confusion. Show **one band and one phone at a time**, with a narration line and a "What just happened" rail.

**Layout:**
- **Left:** a large realistic **band** (strap, round OLED screen, one button) with a hand/wrist.
- **Right:** **one phone frame** showing the adult who matters in this chapter. The name tag above the phone changes: "Ms Mehta (teacher)", "Ms Khan (counsellor)", "Mr Iyer (principal)", "Mrs Sharma (parent)".
- **Top:** a 7-dot chapter timeline + the school clock ("Fri 10:40 am").
- **Bottom:** a narration card (2 lines, EN/HI) + **◀ Back · Do it for me ▶ · Next ▶▶**.
- **Right edge:** the "What just happened" rail in plain words.
- A spotlight dims everything except what the narration is about. Time jumps animate ("⏩ 3:31 pm").
- Keys: → next, ← back, Space = do it, R = restart. Auto-play is available for recording.

**Chapters:**

| # | Chapter | Band (left) | Phone (right) | Narration |
|---|---|---|---|---|
| 1 | **Meet Riya** | The band learns her normal (fast-forward) | The school's setup card: Riya chose Ms Mehta | "Riya, 7B. Her band learned her normal heart rate in two weeks. Here, ten seconds." |
| 2 | **The band notices, Riya names it** | In Maths, HR rises while still → private vibration → "How are you?" ★ **Worried** (suggested) → hold → breathing exercise | Ms Mehta's phone: **nothing happens** | "Only Riya feels it. The model suggested *Worried* from her own past choices; she confirmed. One worried day stays private." |
| 3 | **PT mode** | Riya sets "PT 30 min" → runs → HR high, **no question** | Teacher's My class: "7B PT 11:20–12:00, sensing paused" | "No false alarms, and the band stays on." |
| 4 | **A pattern gets noticed** | Riya picks **Sad** (5th day in 10) | **Counsellor** Patterns: "Riya: sad on 5 of 10 days" → 14-day timeline | "One sad day is private. Five in two weeks reaches the counsellor, with her name." |
| 5 | **Talk to someone, and the reply clock** | Riya: Talk → My adult | Ms Mehta gets a request "Respond by 3:30 pm" → she doesn't → ⏩ 3:31 pm → **the card flies to Ms Khan** → Ms Khan taps Call to talk → "Lunch, Counselling room" → band shows the message → Riya holds "Okay" | "Silence moves it up. Only a real response stops the clock, and the talk happens in person." |
| 6 | **SOS** | Hold 5 s → "Send SOS?" → tap | Counsellor + principal + teacher phones light up; **school map pin "near Block A stairs"** moves to "Library corridor" → Ms Khan taps I'm going → band: "Ms Khan is coming" | "Who, and where, in seconds. If no one answers in 10 minutes, SMS and calls repeat." |
| 7 | **The school learns, without names** | (idle) | Teacher: 7B ⛈️ tense 3 days → activity "Two kind things" · Principal: 92% on time · Parent: band worn ✓, a message from the counsellor | "Teachers get an activity, not names. The principal gets the response report. Parents hear from the counsellor." |

**End card:**
- "Every child can ask. Every request gets an answer."
- **Try it yourself** · **Under the hood** · **Restart**

**Also available:**
- **Try it yourself:** a free play mode with the band + a role switcher (teacher, counsellor, principal, parent).
- **Under the hood** (for technical judges):
  - packet log
  - receipt verification
  - exactly-once via two gateways
  - replay / tamper rejected
  - RSSI location table
  - **emotion model card** (features, per-child Naive Bayes, top-1/top-3 accuracy vs baseline, "child always confirms")
  - audit chain
  - test results

---

## 14. System design

### 14.1 Architecture

```
 Pulse Band (ESP32-C3 + OLED)      Gateways (Bluetooth in, HTTPS out)       Prerana Pulse service (FastAPI)         Adult apps (PWA)
 notices, asks privately,    ───► ESP32 hub · school PC · office root ───► Ingest (verify, keep one, RSSI)        Teacher
 feeling menu, exercises,          (UPS + 4G). Each gateway has a           Receipts (signed after save)      ◄──► Counsellor
 talk, SOS, PT mode                known place → SOS location               Reply clocks, SOS, rules               Principal
 19 encrypted bytes                Offline queue, heartbeats                Emotion model (per child)              Parent
 buzzes once on a signed receipt                                            Insights, audit, devices
                                                                            PostgreSQL 16 (RLS, timers, outbox)
```

**Outside services:**
- PRASUNEX ERP: sign-in, rosters, **timetable**; demo = mock ERP
- FCM push
- SMS gateway (mocked: logged, not sent)
- Prerana AI: class activities (prototype = a reviewed library)

### 14.2 Technology stack

| Layer | We use | Why |
|---|---|---|
| Band | ESP32-C3, MAX30102, MPU6050, 0.96" OLED | BLE 5 + AES in hardware; cheap; the screen shows words |
| Gateway | One Python program; ESP32 hub firmware | Runs on hubs and school PCs |
| API | FastAPI, server-sent events | Async, typed, live staff screens |
| Database | PostgreSQL 16 | RLS, timers and outbox in one place |
| Alerts | FCM push, SMS gateway | Push first; SMS for SOS repeats and late cases |
| Apps | React PWA (prototype: plain JS modules, same screens) | One codebase for all adults |
| ML | Per-child Naive Bayes (band + server) | Tiny, explainable, learns from the child's own choices |
| Ops | Docker, CI, India-region cloud | Data stays in India |

**Rejected:**

| Option | Why not |
|---|---|
| LoRaWAN | ~₹14 lakh per school |
| Redis | Safety timers shouldn't live in a cache |
| MQTT | One more server |
| Wi-Fi/SIM in the band | Fees, battery, phone-like |
| GPS in the band | Doesn't work indoors, power-hungry; gateways give room-level location for free |
| Voice on the band | Costly, and speaking in class isn't private |

### 14.3 Band protocol (unchanged envelope, new types)

**Message (19 bytes):** `ver(1) | rotating ID(4) | counter(4) | type+arg (2, encrypted) | AES-CCM tag(8)`

- The rotating ID changes every 15 minutes.
- Nonce = rid | counter | epoch | ver. AAD = header.

| Type | Name | arg |
|---|---|---|
| 1 | feeling | feeling code (1 fine, 2 worried, 3 sad, 4 angry, 5 scared, 6 stressed, 7 jealous, 8 left out, 9 unwell, 10 just active) |
| 2 | skipped | — |
| 3 | talk | 0 = my adult, 1 = counsellor |
| 4 | sos | 0 = danger, 1 = medical |
| 5 | cancel | low byte of the SOS counter |
| 6 | status (any message waiting?) | — |
| 7 | battery | % |
| 8 | pause (PT mode) | minutes |
| 9 | message seen ("Okay") | low byte of the message id |
| 10 | exercise done | 1 = felt better, 2 = wants to talk |
| 11 | suggestion result | 1 = accepted ★, 0 = picked another (for model evaluation) |

**Receipt (22 bytes):**
- Format: `'R' | rid | counter | status (0 ok, 1 duplicate, 2 message waiting) | server_epoch | tag`, signed with the band key after save.
- A waiting short message is fetched by the band through the gateway on status 2. In the prototype it's delivered via the receipt flow + the server message queue.

**SOS location:**
- Gateways forward each packet with `rssi` and their id.
- The server keeps sightings from the last 30 s and picks the strongest.

### 14.4 Data model (every table and column)

All tenant tables use **FORCE ROW LEVEL SECURITY** (`app.role='system' OR school_id = app.school_id`). The app role is `pp_app` (NOBYPASSRLS). Students are pseudonymous; names live in the ERP.

| Table | Columns |
|---|---|
| `schools` | id, name, tz, day_end, staff_end, school_days, holidays[], wrapped_key |
| `classes` | id, school_id, name |
| `timetable` *(new)* | id, school_id, class_id, weekday, start, end, subject, pauses_sensing (bool) |
| `users` | id, school_id, role (student/teacher/counsellor/principal/parent/nurse/pocso/management/admin), erp_ref, class_id, age_pack (junior/teen), can_be_chosen, language, child_id (for parents) |
| `trusted_adults` | school_id, student_id, adult_id, chosen_at |
| `consents` | school_id, student_id, sensing, feelings_to_counsellor, given_by, given_at |
| `health_profiles` | school_id, student_id, pause_sensing, nurse_on_sos, notes_enc |
| `bands` | id, school_id, student_id, key, last_counter, last_seen, battery, revoked, pt_until, model_json |
| `gateways` | id, school_id, kind, location_name, map_x, map_y, token_hash, version, last_heartbeat |
| `band_events` | id, school_id, band_id, counter, type, arg, received_at, gateways[], receipt; UNIQUE(band_id, counter) |
| `sightings` *(new)* | id, school_id, band_id, gateway_id, rssi, at |
| `feelings` *(new)* | id, school_id, student_id, feeling, suggested, accepted_suggestion, hr_rise_pct, period, source (band-ask/band-self), at |
| `exercises` *(new)* | id, school_id, student_id, feeling, done_at, result (better/talk/none) |
| `cases` | id, school_id, ref, student_id, kind (talk/sos/medical_sos/pattern/staff), status (open/acknowledged/responded/resolved/cancelled), level, to_whom, recipients[], ever_recipients[], deadline, level_started_at, created_at, acknowledged_at, first_response_at, last_activity_at, location_gateway, location_at, version |
| `band_messages` *(new)* | id, school_id, band_id, case_id, from_user, text (≤60), created_at, delivered_at, seen_at |
| `case_events` | id, school_id, case_id, at, actor_id, kind, detail, prev_hash, hash *(append-only, hash chain)* |
| `timers` | id, school_id, case_id, kind (escalate/remind/sos_repeat), level, due_at, detail, done |
| `outbox` | id, school_id, channel (push/sms/call_task/panel/band), to_user, title, body, case_id, created_at, sent_at |
| `notifications` | id, school_id, user_id, channel, title, body, case_id, created_at, read_at |
| `alerts` | id, school_id, rule, rule_version, student_id, class_id, to_user, at, detail |
| `access_log` | id, school_id, user_id, case_id / student_id, reason, at |
| `activities` | id, school_id, class_id, activity_code, suggested_at, done_at |
| `parent_messages` *(new)* | id, school_id, student_id, from_counsellor, text, created_at, read_at |

### 14.5 APIs

| Area | Routes |
|---|---|
| Gateway | POST /api/gw/ingest (packets + rssi), POST /api/gw/heartbeat, GET /api/gw/time |
| Auth (demo) | GET /api/auth/demo-users, POST /api/auth/login |
| Teacher | GET /api/teacher/today, GET /api/class/{id}/mood, GET /api/class/{id}/timetable, POST /api/activities/{id}/done |
| Cases | GET /api/queue, POST /api/cases/{id}/open (reason), GET /api/cases/{id}, POST /api/cases/{id}/call (when, where → band message; stops the clock), POST /api/cases/{id}/talked, POST /api/cases/{id}/handover, POST /api/cases/{id}/ack (I'm going), POST /api/cases/{id}/resolve |
| SOS | GET /api/sos/active (with live location), GET /api/sos/{id}/trail |
| Counsellor | GET /api/patterns, GET /api/students/{id}/feelings (consent), POST /api/students/{id}/inform-parent |
| Principal | GET /api/reports/response (+ .csv), GET /api/gateways (map) |
| Parent | GET /api/parent/home, POST /api/parent/consent |
| Model | GET /api/model/card, GET /api/model/suggest?band= (demo) |
| Live | GET /api/events (SSE) |
| Demo | GET/POST /api/demo/clock, POST /api/demo/reset, GET /api/demo/bands, POST /api/demo/story/{step} |

### 14.6 Security and privacy (Round 2 threats + new)

| Threat | What we do |
|---|---|
| Fake press | Per-band key; the 8-byte code is checked; rate limit |
| Replayed press | The counter must go up |
| Gateway snooping | Rotating ID + encrypted type |
| Gateway fakes "sent" | Only the server signs receipts with the band key |
| Staff snooping | Role limits; a reason logged for every read; the counsellor sees names only for patterns, SOS and requests |
| Tracking a child | Location only during SOS, only inside school, only to SOS recipients |
| Lost band | Key revoked; the band holds no data beyond its own small model |
| Prank SOS | Hold + confirm, 60 s cancel, cap on repeats, a talk not a penalty |

- **DPDP:** parent consent on admission; sensing and counsellor visibility can be switched off.
- **POCSO:** reporting path via the counsellor/principal.
- **Wellness, not medical:** no diagnosis; "Unwell" is the child's own choice.
- **Data:** stays in India; deleted when a child leaves; never used for marks, discipline or ads.

---

## 15. Scale, cost, feasibility

**Planning numbers (Round 2, assumptions):**

| | 1 school | 500 schools |
|---|---|---|
| Students | 1,800 | 900,000 |
| New cases a month | 36 | 18,000 |
| Feeling check-ins a day | 540 | 270,000 |
| Peak messages | ~3/s | ~1,500/s |
| New data a year | ~50 MB | ~25 GB |

- **Measured (Round 3):** 386 band messages/s on a 2-vCPU machine, one API process.
- **What breaks first:** radio coverage in old buildings, not the server. SOS location needs gateways in corridors, stairs and the playground.
- **Cost for one school:**
  - band: under ₹1,000 (OLED adds about ₹150–250)
  - hubs: ₹300–500 each, or existing PCs
  - office root: ₹2,000–3,000
- **Business:** one tenant per school · PRASUNEX sign-in · add-on module.

**Acceptance tests:**
- press to queue: 95% within 3 s
- gateway off 10 min: every event arrives once
- missed deadline: next level alerted in 60 s
- replay/fake: always rejected
- class view: under 10 never shows
- server restart mid-escalation: no alert lost
- **SOS location shown within 10 s and updated as the child moves**
- **PT mode: no questions during PT**
- **persistent feeling reported on the 5th day, not before**

**Plan B:** if the band is not ready, the virtual band runs the same logic in the browser and sends real encrypted packets through the same pipeline.

---

## 16. Design system and UX rules

**Rules:**
1. **One job per screen.** At most 3 action cards. One primary button per card.
2. **Plain words.**

   | Instead of | Say |
   |---|---|
   | escalated | moved up because no one responded |
   | acknowledged | going |
   | resolved | closed |
   | hash chain | history can't be changed |

3. **Always who and when.** "Respond by 3:30 pm · 4 h left."
4. **Red only for SOS.** Purple brand, green done, amber time running out.
5. **Big tap targets** (≥ 48 px). Bilingual EN/HI. Feelings always shown as **words** with a small icon.
6. **Technical detail only in "Under the hood".**
7. **Helplines on every screen.**
8. **Kind tone.** "Thank you for telling us." No red badges on child-facing screens.
9. **Accessible:** WCAG AA, keyboard, aria-live for band events, reduced motion.

**Look and feel:**

| Element | Choice |
|---|---|
| Brand purple | #6C4CF1 (ink #4B2FD6, soft #EEEAFE) |
| Ink | #0F172A |
| Background | #F8F7FF |
| Green | #0F9D6B |
| Amber | #B45309 |
| Red (SOS only) | #DC2626 |
| Fonts | Plus Jakarta Sans + Noto Sans Devanagari |
| Shapes | Rounded cards, soft shadows, device frames (band, phone) |

**Signature components:**
- **BandWidget:** a realistic band with an OLED screen in monospace white-on-black, one button with a hold ring, and vibration rings.
- **PhoneFrame**
- **CountdownChip**
- **JourneyLine** (Ms Mehta → Counsellor → Principal → Management)
- **SchoolMap** (simple floor plan SVG with gateway dots and a pulsing SOS pin)
- **FeelingChip** (word + icon)
- **WeatherIcon**
- **NarrationCard**, **ChapterTimeline**, **StoryRail**
- **ReasonSheet**, **CallToTalkSheet**

**Delight:**
- the vibration rings on the band
- the menu scrolling on the OLED
- the breathing ring
- the request card flying from Ms Mehta's phone to Ms Khan's
- the SOS pin moving on the map
- the "Ms Khan is coming" text appearing on the band
- flipping to Hindi live

---

## 17. Build plan and acceptance checklist

**Build order (one go):**
1. Engine (in-browser server for the hosted demo):
   - the new types, feelings, exercises, PT mode, timetable, persistent-feeling rule, talk + call-to-talk + band messages, SOS + RSSI location + map
   - per-child Naive Bayes + model card
   - parent consent and messages
   - keep the crypto byte-identical
2. Virtual band with the OLED menu, gestures, exercises, PT mode and SOS.
3. Adult apps (teacher, counsellor, principal, parent).
4. Story Mode + Try it yourself + Under the hood.
5. Backend (FastAPI + PostgreSQL) with the same rules and endpoints, plus tests.
6. Playwright Story run + video.
7. Docs, deck.

**Checklist:**
- [ ] No tablet anywhere; the child uses only the band.
- [ ] Every row in §6–§11 works or is labelled simulated.
- [ ] One feeling = private; the 5th day of the same feeling in 10 days = counsellor with the name (tested).
- [ ] PT mode: no questions; SOS still works (tested).
- [ ] SOS shows location on the map within 10 s and follows the child (tested).
- [ ] Call to talk stops the clock; the band shows the message; "Riya saw it ✓".
- [ ] The model suggests first; the child confirms; the model card shows measured top-1/top-3 vs baseline.
- [ ] Parents get no automatic alerts.
- [ ] Story Mode ≤ 6 minutes, understandable from captions alone.
- [ ] No screen has more than 3 action cards; no developer words outside Under the hood.
- [ ] Hindi toggle works.
- [ ] All tests pass (backend, engine, Playwright).

---

## 18. Honesty rules

- **Never claim the band detects emotions.** Say: *"The band notices a change; the child names the feeling. A small model learns each child's patterns to suggest the likely word first."*
- **Built and tested:**
  - server, protocol, receipts, gateway program, engine
  - virtual band, adult apps, rules, emotion suggestion model (with measured accuracy on simulated data)
- **Simulated:**
  - SMS and calls (logged)
  - ERP and timetable (sample)
  - push (in-app)
  - Prerana AI activities (reviewed library)
  - RSSI (virtual band "where is Riya" control)
  - sign-in
- **Written, not tested:** band firmware (no hardware this round), gateway Bluetooth mode, Docker Compose.
- Planning numbers are assumptions; only 386 messages/s is measured.
- Demo names are made up; it is a Team Monarch prototype, not a PRASUNEX product.

---

## 19. Prompt for Claude Code

```
You are rebuilding Prerana Pulse (Team Monarch, PRASUNEX Innovathon 2026). Read document.md fully; it is the single source of truth. Build everything in it in one go.

Key decisions (do not change): the child uses ONLY the band (no tablet, no student portal). Adults use one simple PWA with four roles: teacher, counsellor, principal, parent. The band notices a sustained heart-rate rise while still (not in PT mode), vibrates privately, and shows a word menu on a small OLED (one button: tap = next, hold 1 s = choose, double tap = open menu, hold 5 s + tap = SOS). The first item is suggested by a per-child Naive Bayes model; the child always confirms. Each feeling triggers a matching 1-minute exercise. One-off feelings are private; the same difficult feeling on 5 of the last 10 school days reports to the counsellor with the name. Talk to someone creates a request with a reply clock; adults respond by "Call to talk" (time + room) which appears on the band and stops the clock. SOS sends live room-level location from the strongest gateway (RSSI), shown on a school map, to counsellor, principal and class teacher (nurse for medical). PT mode pauses noticing (child-set or from the timetable). Parents get consent controls and counsellor-shared messages only, never automatic alerts.

Keep the existing FastAPI/PostgreSQL backend, gateway, crypto (byte-identical with Python) and engine approach; extend them. Rebuild the web UI to be calm and simple: one job per screen, at most 3 action cards, plain words, EN/HI, helplines (1098, 112, 14416) on every screen, technical detail only in Under the hood. Build Story Mode (band on the left, one phone on the right, 7 chapters, narration, Do it for me, What just happened rail, animated time jumps, the request card flying between phones, the SOS pin moving on a map). Write tests for every rule. Measure the model's top-1/top-3 accuracy vs a baseline on simulated children and show the real numbers. Follow the honesty rules. Finish only when the checklist in section 17 is complete.
```
