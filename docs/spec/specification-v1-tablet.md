# Prerana Pulse: complete project specification and UI/UX rebuild brief

Team Monarch · PRASUNEX Innovathon 2026 · Rounds 3 and 4.

This document is the single source of truth for the project. It covers:
- everything we promised in the Round 2 deck (Solution Design, 15 slides);
- the code that already exists;
- the new emotional-intelligence and ML features;
- the redesigned, simpler UI/UX and demo.

The last section is a ready-to-paste prompt for Claude Code. That prompt tells it to rebuild the app **in one go**, with every feature, and a much simpler interface.

---

## 0. How to read this document

| Part | What it gives you |
|---|---|
| 1. The product in one page | Positioning, tagline, the one-line idea |
| 2. Problem statement | The facts and the "why now" from the Round 2 deck |
| 3. Who uses it | Every role and what each one needs |
| 4. USPs | Everything that makes us different, with the competitor table |
| 5. Feature list | Every feature, grouped, with exact rules and numbers |
| 6. Emotional intelligence and ML | Feeling words, mood check-ins, feelings timeline, the Prerana AI urgency hint |
| 7. System design | Architecture, protocol, data model (every table and column), APIs, security |
| 8. What already exists in the repo | So nothing working is thrown away |
| 9. UI/UX problems today | What is confusing and why |
| 10. UI/UX principles | The rules every screen must follow |
| 11. Screen-by-screen spec | Every screen, what is on it, what is NOT on it |
| 12. The demo experience | Story Mode, the 6-minute demo, presenter controls |
| 13. Visual design system | Colours, type, components, motion, Hindi support |
| 14. Making it interesting | Delight details that make judges remember it |
| 15. Build plan | Tech choices, folder layout, one-go build order |
| 16. Acceptance checklist | How we know it is done |
| 17. Honesty rules | What we may and may not claim |
| 18. Prompt for Claude Code | Paste this to start the build |

---

## 1. The product in one page

**Name:** Prerana Pulse

**Tagline (from Round 2):** *A phone-free way for any student to ask for help, and a reply the school can't ignore.*

**Short line for the demo:** *A band that notices, then asks. A reply clock that escalates on its own. A software module for the PRASUNEX ERP.*

**What it is:**
1. **A safety band for every child** (a wristband with one button). It learns the child's normal resting heart rate. When the heart rate stays clearly higher while the child sits still, it buzzes gently and asks, "Are you okay?" The child answers with taps. The band **never guesses the feeling**. The child can also ask for help any time: three taps to talk, or hold 5 seconds and confirm for help now.
2. **A reply promise in software.** Every request goes to an adult the child chose, with a deadline (the "reply clock"). If nobody replies in time, it moves up on its own: counsellor, then principal. Help now reaches three people at once and repeats by SMS and call until someone answers.
3. **A wellbeing layer built on top of safety.** Children learn feeling words, name how they feel in private, and the school sees each class's mood without names. The counsellor sees patterns early. Teachers get a 10-minute class activity from Prerana AI, not a list of names. This is the emotional-intelligence part.

**Positioning (decided):** **Safety first, wellbeing built in.** The pitch opens with safety: a child can always reach a trusted adult, and the school must answer. Emotional intelligence is the second layer:
- the child learns to name feelings;
- the school sees patterns early;
- teachers get class activities.

It is not "a mood tracker". It is not "only a panic button" either.

**What a child never has to do:** own a phone, say it out loud first, or tell their parents before anyone else.

**Domains:** EdTech and Smart Education · AI and ML · Social Impact.

---

## 2. Problem statement

**Headline:** *Children carry it alone, and schools find out too late.*

| Fact (as used in our Round 2 deck) | Source |
|---|---|
| 13,892 students in India died by suicide in 2023, the highest in ten years. In 2014 it was 8,032. | NCRB, Accidental Deaths and Suicides in India 2023 |
| Many schools ban phones (Himachal Pradesh from 1 March 2026). Only 36% of rural boys and 27% of rural girls aged 14–16 own a smartphone. | ASER 2024 |
| Report apps exist abroad, but students say some reports got no help at all. | NBC News (2023) |
| July 2025: the Supreme Court told schools to set up confidential reporting and counselling (15 binding guidelines). | Sukdeb Saha v. State of Andhra Pradesh, 25 Jul 2025 |
| The Ministry of Education's UMMEED guidelines ask every school to run a wellness team. CBSE asks for one counsellor per 500 students. | UMMEED, CBSE |

**Three root problems:**
1. **They stay silent.** Children fear their parents will be told, feel ashamed, or don't have the words for what they feel.
2. **They can't use a phone.** Phones are banned or not owned, so app-only solutions don't reach most Indian children.
3. **Reports go unanswered.** A report with no reply teaches a child not to ask again. Nobody sees the silence.

**Our answer to each:**

| Problem | Our answer |
|---|---|
| Silence, shame, no words | The band asks first. Answering takes one tap. Feeling words are taught on the tablet. Parents hear from the counsellor, never through an automatic alert. |
| No phone | A band plus a shared class tablet or the student portal. No phone is ever needed. |
| No reply | Every request has an owner and a deadline. Silence moves it up automatically. The principal sees response times. |

---

## 3. Who uses it

| Role | Device | Their one job in Prerana Pulse | What they see |
|---|---|---|---|
| **Student** | Band, class tablet (tap card sign-in), student portal | Ask for help, name feelings, read replies | Their own requests, replies, who opened them, feelings, helplines |
| **Chosen adult** (any teacher the child picks) | Phone (PWA), push or SMS | Reply to children who chose them, before the deadline | Only requests sent to them |
| **Class teacher** | Phone / laptop | Look after the class mood | Class mood (no names), the suggested 10-minute activity |
| **Counsellor** | Laptop / phone | Handle everything urgent first | Urgent-first queue, cases, feelings timelines (with consent), Prerana AI urgency hints, inform parents |
| **Wellness teacher** (UMMEED wellness team) | Phone | Notice children who have gone quiet | "Band silent" and "goes quiet" notes |
| **POCSO officer** | Phone | Handle help-now and staff reports | Help-now alerts, reports naming a staff member |
| **Principal** | Laptop / phone | Make sure the school answers | Response report (for the Supreme Court compliance file), help-now alerts, office panel |
| **Nurse** | Phone | Medical help when a health profile says so | Help-now alerts for children whose profile adds the nurse |
| **Management / trust** | Laptop | Oversight | Requests nobody answered at any level, school-level report |
| **Parent** | Phone (PWA) | Give consent; hear from the counsellor | Consent switches (sensing on/off), messages the counsellor chooses to share. **No automatic alerts.** |
| **IT admin** | Laptop | Keep devices running | Gateway and band health, provisioning |

---

## 4. USPs (unique selling points)

**USP 1: The band asks first.** The child doesn't have to start the conversation. The band notices a sustained rise in heart rate while the child is still, then gently asks. It never decides how the child feels.

**USP 2: Phone-free.** It works with a band, a shared class tablet and the portal, which suits Indian schools where phones are banned or not owned.

**USP 3: A reply the school can't ignore.** Each request has a reply clock. If nobody answers, it escalates on its own: chosen adult → counsellor → principal → management. Only a real reply stops the clock; opening the message doesn't.

**USP 4: The child chooses the adult.** Trust matters more than hierarchy.

**USP 5: Silence is a signal.** Three unanswered band questions in a row, or a band silent for a whole school day, quietly tells the right adult.

**USP 6: A route around an accused staff member.** A report naming a staff member goes to the principal and POCSO officer. That person's own chain never sees it.

**USP 7: Help now reaches three people at once.** The counsellor, POCSO officer and principal (plus the nurse if the health profile says so) are alerted together. After a 10-minute clock, SMS and a call task go out every 10 minutes until someone answers.

**USP 8: Built for Indian law.**
- Supreme Court 2025 guidelines: confidential reporting, counselling, and a response report.
- POCSO reporting path.
- DPDP Act consent: parents consent on the admission form and can switch sensing off.
- UMMEED wellness team.

**USP 9: Privacy you can see.**
- Every staff read needs a reason, and the student sees who opened their case and why.
- A friend report seals the reporter's name; revealing it needs two people.
- The history can't be edited (hash chain).
- Only the child's answers leave the band, never raw heart data.

**USP 10: Receipts gateways can't fake.** One buzz means the school's server has the message. A receipt signed with the band's own key is the only thing that makes it buzz once.

**USP 11: IDs that change every 15 minutes.** Nobody can track a child by Bluetooth, and the gateway relays bytes it can't read.

**USP 12: Teaches feeling words.** Children learn to name feelings (emotional intelligence), in English and Hindi, with simple meanings and coping tips.

**USP 13: Class view, no names.** A heatmap for each class is built from answers. Any group under 10 is hidden. Teachers get a 10-minute activity from Prerana AI, not a list of names.

**USP 14: Prerana AI hints that only raise priority.** A multilingual classifier (English, Hindi, Hinglish) reads a child's message and picked feelings. It can move a case up the counsellor's queue, with the reason shown. It never lowers priority, never closes a case and never contacts anyone by itself.

**USP 15: Inside the school ERP.** It's a software module for the PRASUNEX ERP: same sign-in, same rosters, sold as an add-on, one tenant per school. It **works with or without bands**: tablet and portal alone are useful from day one.

**USP 16: Cheap and offline-tolerant.**
- Band: under ₹1,000 target.
- Gateways: existing PCs, or ESP32 hubs at about ₹300–500.
- Office root: UPS + 4G, about ₹2,000–3,000.
- Gateways queue messages when the internet is down.

**One-line summary (Round 2):** *Every piece exists somewhere. We found no product that joins a band that learns each child, a reply the school must give and India's child-safety rules, inside a school ERP.*

### Competitor table (from Round 2, public product pages checked 6 and 13 Nov 2026; "Not found" means we didn't see it, not that it doesn't exist)

| Capability | Linewize Pulse | Microsoft Reflect | Mightier | Gökyuva | STOPit | Prerana Pulse |
|---|---|---|---|---|---|---|
| Child picks the adult | Yes | No | No | Yes | Not found | Yes |
| Reply clock, auto-escalation | Not found | No | No | Yes | Partly | Yes |
| Teaches feeling words | Not found | Yes | Not found | Not found | Not found | Yes |
| Heart-rate band | No | No | At home | No | No | In school |
| No student phone needed | Not found | Yes | No | Not found | Not found | Yes |
| Built for Indian law | No | No | No | No | No | Yes |
| Inside a school ERP | No | Partly | No | No | No | As a module |

---

## 5. Complete feature list (with exact rules)

Every item below must exist in the rebuilt app, either working for real or clearly labelled as simulated (see Part 17).

### 5.1 The band (proof of concept: virtual band in the app, firmware in `firmware/band/`)

**Hardware (Round 2 stack):** ESP32-C3 (Bluetooth 5 and AES in hardware, about ₹242 board), MAX30102 heart-rate sensor, MPU6050 motion sensor, vibration motor, one button, small LiPo battery charged at home each night.

**Learn → Notice → Tune → Reset (Round 2 slide 8):**

| Phase | When | What happens |
|---|---|---|
| **Learn** | Weeks 1–2 | No buzzes. Records the child's resting heart rate when still, **at different times of day** (time-of-day baselines, e.g. morning / midday / afternoon). |
| **Notice** | After that | Buzzes only when the heart rate is well above that child's normal **for that time of day**. |
| **Tune** | Every answer | Repeated "okay" answers **raise that child's threshold** (fewer needless questions). "Not great" keeps it where it is. |
| **Reset** | Each term | Children grow, so the band relearns their normal every term. |

**It buzzes only if ALL of these are true:**
- heart rate at least **20% above this child's normal** (a starting value, to be tuned on real readings);
- for **2 minutes or more**;
- sitting still, with **no movement in the last 5 minutes**;
- **fewer than 3 questions today**;
- sensing isn't paused in the child's health profile.

This is simple statistics on the band, not a heavy AI model. In the demo, timings are shortened, and a "Demo speed" label must say so.

**The question and the answers:**

| Child does | Meaning | What happens |
|---|---|---|
| 1 tap | Okay | Saved privately. No one alerted. Threshold tuned up a little. |
| 2 taps | Not great | **Calm-down buzz** (slow pulses to breathe along with). Saved privately, nobody alerted. Later on the tablet the child is invited to **name the feeling** (kept private). |
| 3 taps | I want to talk | Request to the chosen adult; reply clock starts. |
| No answer | | **Asks again in 10 minutes.** Still no answer: logged as **skipped**. |
| 3 skipped in a row | | **Quiet note to the chosen adult** ("goes quiet" rule). |
| 3 taps any time (no question) | I want to talk | Same as above. |
| Hold 5 s, then press once to confirm | **Help now** | See 5.3. Cancel by holding 2 s within 60 s. |

**Junior mode (classes 3–5):** one tap = okay, **hold to talk** (hold about 2 s, release). Hold to 5 s and confirm = help now. The tablet uses the junior feelings pack.

**Set-up when the band is handed out:**
- **Fit:** the teacher or parent fits the strap; a short buzz confirms a clean reading.
- **Health profile:** asthma, ADHD medicine or a heart condition adjusts or pauses sensing. It can also add the nurse to help-now.
- **Battery:** charged at home each night. A battery report goes to the server; "charge tonight" appears for low bands.
- **Lost band:** its key is revoked; the band holds no data.

**Buzz language (must be shown on screen in the demo):**

| Buzz | Meaning |
|---|---|
| One short buzz | Delivered: the school's server has it (receipt verified) |
| Two short buzzes | Not delivered yet, still trying (none heard in 15 s) |
| Three soft buzzes | The band is asking "Are you okay?" |
| Slow pulses | Breathe along (calm-down) |
| One long buzz | Confirm help now: press once |
| Two long buzzes | A reply is waiting: read it on the tablet |

### 5.2 Speak, and get a reply (the reply clock)

**Ways to ask:** three taps on the band, the class tablet (tap card sign-in, shared device) or the student portal.

**Request types:**

| Type | Who sees it first | Deadline, then |
|---|---|---|
| **Standard** (talk to my adult) | The chosen adult | End of school day (3:30 pm, if at least 1 hour is left; otherwise the next school day) → counsellor by 12:00 next school day → principal by 4:00 pm next school day → management flag |
| **Worried about a friend** | Counsellor | End of school day → principal → management. **Reporter's name sealed.** |
| **Names a staff member** | Principal + POCSO officer | Same school day (4:00 pm); **that person's own chain never sees it** → management |
| **Help now** | Counsellor, POCSO officer, principal (+ nurse) | 10 minutes, then SMS + call task every 10 minutes until acknowledged |

**Clock rules:**
- Reminders at **50% and 80%** of the time.
- **Only a real reply to the child stops a clock.** Opening the message doesn't.
- If the child writes again, the clock restarts at the same level.
- **Schools can shorten clocks, not lengthen them.**
- The child always sees who has the message and by when: "Ms Mehta will reply by 3:30 pm".
- When it moves, the child is told ("Your message moved to Ms Khan, the counsellor. She will reply by 12:00 tomorrow"), and the previous adult is told it moved on.
- School calendar: Asia/Kolkata, Monday–Saturday, holidays respected.

**Why it doesn't fail quietly:**
- Timers sit in PostgreSQL next to the case. A worker claims due ones every 30 s with `SELECT … FOR UPDATE SKIP LOCKED`.
- Alerts leave through an outbox, so a crash can repeat an alert but never lose one.

### 5.3 Help now

- **Trigger:**
  - band: hold 5 s, then confirm with one press;
  - tablet or portal: hold the red button for 2 s.
- **Who is alerted at once:** counsellor, POCSO officer, principal. The **nurse is added** if the health profile says so. An office-panel alert also appears.
- **Clock:** 10 minutes to acknowledge. If nobody does, **SMS and a call task go to all of them, every 10 minutes, until acknowledged.**
- **"I'm going" button:** acknowledges. The repeats stop and the child is told "Help is coming".
- **Cancel:** the child can cancel within **60 s** (hold 2 s on the band). Recipients are told; a quiet check-in later is suggested.
- **Prank control:**
  - hold-and-confirm;
  - cancel within 60 s;
  - **a daily cap on repeat SMS and calls** (help alerts themselves are never dropped);
  - a first misuse means **a talk, not a penalty**.

### 5.4 Learn as a class (insights, no names)

- **Class heatmap ("class mood"):**
  - built only from children's answers (band okay / not great + anonymous class check-in), **never raw heart data**;
  - one row per class, one cell per school day (last 10 school days);
  - **cells with fewer than 10 answers never show.**
- **Weekly anonymous class check-in:** on the shared tablet, with a 6-digit class code and 5 mood faces. No sign-in, no student ID stored.
- **Teacher gets a 10-minute activity from Prerana AI**, not a list of names. It's triggered by the class-tension rule. In the prototype it comes from a reviewed library; the planned version is Prerana AI drafting it and a person approving it.
- **Principal gets response times** for the Supreme Court report (see 5.6).

### 5.5 Rules (versioned and published to students and parents)

| Rule | Trigger | Who hears |
|---|---|---|
| **Class tension** | A class's share of "not okay" answers is **2× the school median for 3 school days** in a row (and at least 15%) | Class teacher gets an activity |
| **Keeps saying not okay** | "Not great" on **5 of the last 10 school days** (this is the "sad for about a week" signal) | **The child is asked first** ("Want to talk?"), then their adult |
| **Goes quiet** | **3 band questions unanswered** in a row | Their chosen adult (quiet note) |
| **Band silent** | **No contact for a school day** | Wellness teacher |
| **Feelings pattern** (new, Part 6) | The same heavy feeling (e.g. scared, lonely) named on 3 or more of the last 5 school days | Counsellor (only with consent), shown as a gentle note |

- **One nudge per child per 14 days** for each rule (cool-down).
- Each alert stores the rule name and version.

### 5.6 Principal's response report (the "Supreme Court report")

- Requests in the last 30 days, split by type and by channel (band / tablet / portal).
- Median time to first reply.
- Share answered before the deadline.
- Number that moved up a level.
- Help-now count and median time to acknowledge.
- Open now.
- **Counts only. No message text, no names.**
- One-click export (CSV, plus a printable one-page PDF view) for the compliance/inspection file, with the line "Basis: Sukdeb Saha v. State of A.P., 25 Jul 2025".

### 5.7 Parents

- Consent on the admission form (DPDP Act). **Sensing is on by default and a parent can switch it off.**
- **Parent: told by the counsellor**, under a published rule, when it's safe to. Never an automatic alert.
- The parent view shows only what the counsellor chooses to share, plus the consent switches and helplines.

### 5.8 Privacy and trust features

- **Reason required to open:** every staff read needs a reason. The student sees "Who has opened this: Ms Khan · 3:31 pm · 'Escalated to me'".
- **Friend reports:** the reporter's name is sealed (encrypted); revealing it needs **both principal and counsellor** within 24 h, and it's logged.
- **Staff report route:** the named person is removed from every step and can't open it.
- **Hash-chained, append-only audit log** per case, shown as "History intact ✓".
- **Messages encrypted at rest** (AES-256-GCM, per-school key).
- **Students pseudonymous:** names come from the ERP at display time.
- **Data:** stays in India; deleted when a child leaves; never used for marks, discipline or ads.
- **Wellness, not medical:** no diagnosis, no emergency detection. The band asks; it never decides.
- **Helplines on every screen:** **Childline 1098**, **Emergency 112**, **Tele-MANAS 14416**.

### 5.8a Gateways and devices

- **Gateway types:**
  - ESP32 hub (corridor or room);
  - school PC (smartboard, lab PC);
  - class tablet app (phase 2);
  - **office root on UPS + 4G backup**.
- Bluetooth in, HTTPS out (port 443). One Python program runs on hubs, PCs and later tablets.
- **Offline queue:** if the internet is down, the gateway stores messages and sends them in order later.
- **Heartbeats:** staff screens show "No gateway heard since 10:40".
- **Plan B (Round 2):** if the band slips, **a tablet button sends the same message through the same pipeline**.

### 5.9 Delivery guarantees (Round 2 slide 7)

1. The band broadcasts 19 encrypted bytes until a receipt arrives.
2. Any gateway hears it and forwards it over HTTPS, port 443.
3. The server checks the code, keeps one copy and saves the case.
4. The server signs a receipt with that band's own key.
5. The band hears the receipt: one buzz. Nothing in 15 s: two buzzes, and it keeps trying.

**Targets:**

| Step | Target |
|---|---|
| A gateway hears the broadcast | under 1 s |
| Gateway to server over HTTPS | 0.4 s |
| Save, keep one copy, sign the receipt | 0.1 s |
| The band hears the receipt | under 1 s |

**Goal:** 95% of presses confirmed within 3 s.

**Why it's built this way:**
- *Two gateways hear it?* The server keeps one copy, because band + counter must be unique.
- *Gateways learn nothing:* the ID changes every 15 minutes and the type is encrypted.
- *Receipts can't be faked:* only the server holds each band's key.
- *Thirty children press at once?* Broadcasts don't queue the way connections do.

---

## 6. Emotional intelligence and ML (new: "option 3", to appear everywhere it fits)

The rule: **the child tells us how they feel; the system helps adults notice patterns early; AI only raises priority and drafts help for humans to approve.** We never claim the band detects emotions from heart rate.

### 6.1 Feeling words: teaching emotional vocabulary

- **Teen pack (classes 6–12), 10 feelings:** Happy, Calm, Worried, Sad, Angry, Scared, Lonely, Left out, Embarrassed, Stressed (exams).
- **Junior pack (classes 3–5), 6 feelings, big faces:** Happy, Okay, Sad, Angry, Scared, Worried.
- **Each feeling card has:**
  - an emoji face and a colour;
  - the word in **English and Hindi** (e.g. Worried / चिंतित, Lonely / अकेला, Left out / अलग-थलग);
  - a one-line kid-friendly meaning ("Worried: when your mind keeps thinking something bad might happen");
  - a short coping tip ("Try: breathe in for 4, out for 6, three times").
- **"Feeling of the week"** card on the class tablet home: one feeling explained in one sentence, with a 1-minute class activity idea. This is what "teaches feeling words" means.

### 6.2 Name the feeling (private mood check-in)

- After the child taps **2 (not great)** on the band, the next time they use the tablet it gently asks, "Earlier you said not great. Want to name the feeling?" They tap one or two feeling cards, or "skip".
- Also available any time from the tablet home: "How do you feel today?"
- Saved privately. **Nobody is alerted by a single answer.**
- The child sees their own **"My week" strip**: 7 small faces. It's theirs; it's never shown to classmates.

### 6.3 Feelings timeline for the counsellor (with consent)

- On a case or a child's profile: a simple 14-day row of faces from band answers and named feelings.
- Shown only to the counsellor, and only if consent allows.
- **The "feelings pattern" rule** (Part 5.5): the same heavy feeling on 3 of the last 5 school days → a gentle note to the counsellor, phrased as "Riya named 'left out' on 3 days this week. Consider a check-in". It never says "Riya is depressed".

### 6.4 Class mood (no names)

- The class heatmap becomes a friendly **"class weather"**:
  - ☀️ mostly okay;
  - ⛅ mixed;
  - 🌧️ many not okay;
  - ⛈️ class tension rule fired.
- Tapping a class shows the 10-day strip and the **top 3 feelings named that week** (only if at least 10 answers).
- Same k ≥ 10 rule. No names, ever.

### 6.5 Prerana AI urgency hint (the ML component)

**What it does:**
- Reads the child's message text (English, Hindi in Devanagari, or Hinglish) plus the feelings they picked.
- Outputs an urgency level (**Normal / Soon / Urgent**) and up to 3 short reasons ("mentions being hit", "feeling: scared").

**What it is allowed to do:**
- **Only raise priority:** an Urgent hint moves the case to the top of the counsellor's urgent-first queue and adds an amber "Prerana AI hint" badge with the reasons.
- It **never** lowers priority, closes a case, replies, or contacts anyone. The human always decides.

**Model (must be real and honest):**
- A lightweight text classifier: **hashed character n-grams (2–4) + word unigrams → logistic regression** (one-vs-rest for 3 classes). Small enough to run on the server **and** in the browser.
- **A hard safety list on top:** messages with phrases about self-harm, abuse, being hit, or wanting to die are always "Urgent", whatever the model says.
- **Training data:** a team-written, labelled set of about 600–900 short messages in English, Hindi and Hinglish, stored in the repo (`ml/data/messages.csv`, columns `text, language, feelings, label`). It must contain no real children's data.
- **Training:** `ml/train.py` (scikit-learn) does a stratified 80/20 split, trains, and prints accuracy, per-class recall and a confusion matrix. **Recall on "Urgent" is the metric we care about.** It exports weights to `ml/model.json`.
- **Serving:**
  - Python: `backend/app/urgency.py` loads `model.json`;
  - browser: `web/src/engine/urgency.ts` loads the same `model.json` for the hosted demo.
- **Shown honestly in the app ("Under the hood"):** model type, training set size, held-out accuracy and Urgent recall (actual numbers printed by `train.py`), and "Hints only raise priority. A person decides."

**Where it appears in the UI:**
- counsellor queue (badge + sort);
- case view (reasons);
- the demo story (chapter 5);
- the "Under the hood" drawer;
- the deck.

### 6.6 Prerana AI class activity

- When class tension fires, the class teacher gets a **10-minute activity**: title, goal, 3–4 steps, and the feeling it addresses (e.g. "Two kind things", "Weather report", "Circle of change").
- Prototype: a reviewed library picked by the top named feeling in that class.
- Planned: Prerana AI drafts it and a person approves.
- The teacher taps **"Done in class"**, and the class mood record notes the activity date.

### 6.7 Suggested first replies (staff UX)

- In a case, show 3 tappable starter replies matched to the picked feelings (e.g. for "left out": "Thank you for telling me. Can we talk at lunch today?"). Staff can edit before sending. This is **template-based** (no AI claim), to make replying fast for busy teachers.

---

## 7. System design

### 7.1 Architecture

```
 Pulse Band (ESP32-C3)        Gateways: Bluetooth in, HTTPS out      Prerana Pulse service (FastAPI)          People
 reads heart rate + motion    ESP32 hub (corridor/room)              Ingest (verify, keep one)                Chosen adult (push/SMS, replies in app)
 buzzes to ask; taps answer ─►School PC (smartboard, lab PC)  ─────► Receipts (signed after save)        ◄──► Counsellor (urgent-first queue, case log)
 sends 19 encrypted bytes     Tablet app (phase 2)                   Escalation (reply clocks)                Class teacher (class mood + activity)
 buzzes once only on a        Office root (UPS + 4G backup)          Cases, chat (two-way, private)           Principal (response report)
 signed receipt                                                      Insights (heatmap, rules, Prerana AI)    Parent (told by counsellor)
                                                                     Audit, health (logs, heartbeats)
 Tablet or portal ── HTTPS, direct (same requests, no band needed) ─►PostgreSQL 16: row-level security,
                                                                     timers, outbox, encrypted messages
```

**Outside services:**
- PRASUNEX ERP (sign-in, rosters) through a thin adapter (OIDC, REST); the demo uses a mock ERP.
- Prerana AI (activities, urgency hint).
- FCM push.
- SMS gateway (mocked: logged, not sent).

### 7.2 Technology stack (Round 2 slide 10)

| Layer | We use | Why |
|---|---|---|
| Band | ESP32-C3, MAX30102, MPU6050 | Bluetooth 5 and AES in hardware; ₹242 board |
| Gateway | One Python program, ESP32 firmware | Runs on hubs, school PCs, later tablets |
| API | FastAPI, server-sent events | Async, typed, live staff screens |
| Database | PostgreSQL 16 | Row-level security, timers and outbox in one place |
| Alerts | FCM push, SMS gateway | Push first; SMS for urgent and late cases |
| Apps | **React web app (PWA)** | One codebase for staff, tablet and portal |
| AI | Prerana AI, multilingual classifier | Class activities; hints that only raise priority |
| Ops | Docker, CI, India-region cloud | Repeatable builds; data stays in India |

**Considered, and why not:**

| Rejected option | Reason |
|---|---|
| LoRaWAN | A ₹775 radio in every band is about ₹14 lakh per school. |
| Redis | About 50 messages a second at 500 schools; safety timers shouldn't live in a cache. |
| MQTT broker | One more server to run. HTTPS already passes school firewalls. |
| Wi-Fi or SIM in the band | Passwords or monthly fees, more battery, and a phone-like device. |

### 7.3 The band protocol

**Message (19 bytes):** `ver (1 B) | rotating ID (4 B) | counter (4 B) | type (2 B, encrypted) | code (AES-CCM tag, 8 B)`

- `rotating ID = HMAC-SHA256(band_key, "rid" || epoch)[:4]`, where epoch = unix time / 900 (it changes every 15 minutes).
- `nonce = rid || counter || epoch || ver`.
- AES-128-CCM, the 9 header bytes as AAD, an 8-byte tag.
- Types:

| Value | Type | Argument |
|---|---|---|
| 1 | answer | 1 okay, 2 not great, 3 talk |
| 2 | skipped | |
| 3 | talk | |
| 4 | help | |
| 5 | cancel | |
| 6 | status (is a reply waiting?) | |
| 7 | battery | |

**Receipt (22 bytes):** `'R' | rid | counter | status (0 ok, 1 duplicate, 2 reply waiting) | server_epoch | tag`, where `tag = HMAC(band_key, "rcpt" || body)[:8]`. It is signed **only after the row is saved**.

**Threats and answers (Round 2 slide 11):**

| Threat | What we do |
|---|---|
| Fake press | Each band has its own key; the server checks the 8-byte code and rate-limits each band |
| Replayed press | The counter must go up; anything older is dropped |
| Gateway snooping | Rotating ID and encrypted type, so it relays bytes it can't read |
| Gateway fakes "sent" | Only the server can sign a receipt with the band's key |
| Staff snooping | Role limits, a reason logged on every read, and the student sees who opened the case |
| Lost band | Its key is revoked; the band holds no data |
| Prank alerts | Hold and confirm, cancel within 60 s, a daily cap; a first misuse means a talk, not a penalty |

### 7.4 Data model: every table and column

PostgreSQL 16. **Every tenant table has `FORCE ROW LEVEL SECURITY`** with the policy `app.role = 'system' OR school_id = app.school_id`. The app connects as `pp_app` (NOSUPERUSER, NOBYPASSRLS). Students are pseudonymous: names live in the ERP.

| Table | Columns | Notes |
|---|---|---|
| `app_settings` | key, value | Demo clock offset, etc. |
| `schools` | id, school_id (generated), name, tz, day_end, staff_end, school_days, holidays[], wrapped_key, created_at | Calendar and per-school data key (wrapped by the master key) |
| `classes` | id, school_id, name, pulse_code (6-digit) | Check-in code for the anonymous tablet |
| `users` | id, school_id, role (student/teacher/counsellor/principal/pocso/nurse/management/admin/parent/**wellness**), erp_ref, class_id, age_pack (junior/teen), can_be_chosen, **language (en/hi)** | No names stored |
| `trusted_adults` | school_id, student_id, adult_id, chosen_at | The child's chosen adult |
| `consents` | school_id, student_id, sensing, personal_checkins, **feelings_visible_to_counsellor**, **ai_hints**, given_by, given_at | DPDP consent switches |
| `health_profiles` | school_id, student_id, pause_sensing, nurse_on_help, notes_enc | Asthma, ADHD medicine, heart condition |
| `bands` | id, school_id, student_id, key, last_counter, last_seen, battery, revoked, **baseline_json** | Per-band key; baselines per time of day (for display/sync) |
| `gateways` | id, school_id, kind (esp32-hub/school-pc/tablet/office-root), location, token_hash, version, last_heartbeat | Health |
| `band_events` | id, school_id, band_id, counter, type, arg, received_at, gateways[], receipt; UNIQUE(band_id, counter) | Exactly once |
| `cases` | id, school_id, ref (PP-101…), student_id, kind (standard/friend/staff/help_now), status (open/acknowledged/replied/resolved/cancelled), level, source (band/tablet/portal), category, feelings[], about_staff_id, recipients[], ever_recipients[], deadline, level_started_at, created_at, acknowledged_at, first_reply_at, last_activity_at, sealed_reporter, **ai_urgency (normal/soon/urgent)**, **ai_reasons[]**, **ai_model_version**, version | The case |
| `messages` | id, school_id, case_id, sender_id, from_child, nonce, body_enc, created_at | AES-256-GCM |
| `case_events` | id, school_id, case_id, at, actor_id, kind, detail (json), prev_hash, hash | Append-only, hash chain; UPDATE/DELETE revoked and blocked by trigger |
| `timers` | id, school_id, case_id, kind (escalate/remind/help_repeat), level, due_at, detail, done | Claimed with SKIP LOCKED |
| `outbox` | id, school_id, channel (push/sms/call_task/panel), to_user, title, body, case_id, created_at, sent_at, attempts | Never lose an alert |
| `notifications` | id, school_id, user_id (NULL = office panel), channel, title, body, case_id, created_at, read_at | In-app inbox |
| `personal_checkins` | id, school_id, student_id, answer (okay/not_great/talk/skipped), source, at | Band and tablet answers |
| **`feelings`** (new) | id, school_id, student_id, feelings[] (codes), source (band-followup/tablet/case), at | Named feelings |
| `class_pulse` | id, school_id, class_id, mood (1–5), **feeling** (optional code), at | **No student column** |
| `alerts` | id, school_id, rule, rule_version, student_id, class_id, to_user, at, detail | Rule firings and cool-down |
| `access_log` | id, school_id, user_id, case_id, reason, at | Reason for every read |
| **`activities`** (new) | id, school_id, class_id, activity_code, suggested_at, done_at | Class activity tracking |

### 7.5 APIs (existing, keep them; add the new ones)

| Area | Routes |
|---|---|
| Sign-in (demo) | GET /api/auth/demo-users, POST /api/auth/login |
| Student | GET /api/me, GET /api/me/adults, POST /api/me/trusted-adult, GET /api/me/staff, POST /api/cases, GET /api/me/cases, **POST /api/me/feelings**, **GET /api/me/week** |
| Cases | POST /api/cases/{id}/open (reason), GET /api/cases/{id} (428 until a reason is given), POST /api/cases/{id}/messages, /ack, /resolve, /inform-parent, /unseal, GET /api/cases/{id}/verify |
| Staff | GET /api/queue (live, urgent-first), GET /api/notifications, POST /api/notifications/read, GET /api/insights/heatmap, GET /api/insights/rules, GET /api/reports/response (+ .csv), GET /api/gateways, **GET /api/students/{id}/feelings** (counsellor, consent), **POST /api/activities/{id}/done**, **GET /api/reply-suggestions?case_id=** |
| AI | **POST /api/ai/urgency** (text, feelings → level, reasons; also run automatically on case creation and child messages), **GET /api/ai/model-card** |
| Class check-in | POST /api/pulse (no sign-in) |
| Gateways | POST /api/gw/ingest, POST /api/gw/heartbeat, GET /api/gw/time |
| Live | GET /api/events (server-sent events) |
| Demo only | GET/POST /api/demo/clock, POST /api/demo/reset, GET /api/demo/bands, GET /api/demo/gateway-tokens, **POST /api/demo/story/{step}** (performs a story step server-side) |
| Parent | **GET /api/parent/child**, **POST /api/parent/consent** |

Round 2 key APIs, for the slide: `POST /ingest · POST /cases/{id}/reply · GET /queue (live) · GET /heatmap/{class}`.

### 7.6 Scale and cost (Round 2 slide 12, planning assumptions, not measurements)

| Load | 1 school | 500 schools |
|---|---|---|
| Students | 1,800 | 900,000 |
| New cases a month | 36 | 18,000 |
| Escalation timers | about 0 | 0.02 a second |
| Personal check-ins a day | 540 | 270,000 |
| Class check-in peak | 3 a second | 1,500 a second |
| New data a year | about 50 MB | about 25 GB |

**How it grows:**
- up to ~50 schools: one database, two API servers;
- up to ~500: a read copy for heatmaps, monthly partitions;
- beyond that: split by region.

**What breaks first** is radio coverage in old buildings, not the server.

**Measured in Round 3:** 386 band messages per second on a 2-vCPU machine with one API process. The worst-case class check-in peak needs about 1,500 per second at 500 schools, so a few API servers, which is in line with the Round 2 plan. Load test to 2,000/s planned.

**Cost for one school:** band under ₹1,000 target, in the school kit; gateways are existing PCs or ESP32 hubs at about ₹300–500; office root UPS + 4G about ₹2,000–3,000.

**Business:** one tenant per school · same PRASUNEX sign-in · sold as an add-on module · works with or without bands.

### 7.7 Feasibility and acceptance tests (Round 2 slide 15)

| Challenge | Our answer |
|---|---|
| Bluetooth range unmeasured | Wall test; gateway count set by measurement |
| A gateway dies silently | Heartbeats; staff screens show "no gateway heard since 10:40" |
| Power and internet fail together | Office root on UPS + 4G; two buzzes; printed helplines |
| False alarms | Motion filter, 5-minute wait, at most 3 questions a day |
| Counsellor overload | Urgent-first queue, reminders at 50% and 80%, 14-day cooldown, Prerana AI urgency hint |
| No PRASUNEX API yet | A thin adapter (OIDC, REST); the demo uses a mock ERP |

**Acceptance tests:**
- Press to queue: 95% of 20 presses in 3 s.
- Gateway off 10 min: every event arrives once.
- Missed deadline: next level alerted in 60 s.
- Replayed or faked message: always rejected.
- Heatmap: under 10 answers never shows.
- Server restart mid-escalation: no alert lost.

---

## 8. What already exists in the repository (keep it working)

Repo: `prerana-pulse/`

| Path | What it is | Keep / change |
|---|---|---|
| `backend/app/*.py`, `schema.sql` | FastAPI + PostgreSQL server: ingest, receipts, routing ladder, school calendar, timers (SKIP LOCKED), outbox, help-now repeats, rules, heatmap, report, audit chain, RLS, encrypted messages, mock ERP, demo clock | **Keep.** Add: feelings table and APIs, feelings-pattern rule, band-silent rule, wellness role, AI urgency, parent APIs, reply suggestions, story endpoint, "asks again in 10 min", 3-questions-a-day cap. |
| `backend/tests/` | 19 tests on real PostgreSQL | **Keep passing**; add tests for new rules, urgency (only raises), parent consent |
| `gateway/gateway.py` | Gateway program: forward, offline disk queue, heartbeat, simulated radio (`/air`, `/power`, `/status`), BLE mode (untested) | Keep |
| `firmware/band/band.ino` | ESP32-C3 firmware (written, untested) | Keep; update for junior mode, time-of-day baseline, ask-again-in-10-min, 3/day cap |
| `web/js/crypto.js` | AES-CCM in the browser, byte-identical with Python | **Keep** (port to TS if moving to React) |
| `web/js/engine.js` | In-browser copy of the server for the hosted demo (no install) | **Keep the idea**; extend with every new feature; keep `web/tests/engine.test.mjs` passing |
| `web/js/band.js` | Virtual band logic | Keep logic; new UI |
| `web/js/views/*`, `web/css/app.css` | Current UI | **Replace** with the new React PWA UI described below |
| `tools/e2e_desk.py` | Playwright end-to-end run + video recording | Rewrite for the new Story Mode |
| `docs/TECHNICAL.md`, `docs/DEMO_SCRIPT.md` | Docs | Update after the rebuild |

**Hosted demo constraints (claude.ai artifact):**
- The page must work as static files with **relative paths**.
- **Routes must be plain hashes** like `#story`, `#student`, `#teacher` (no `#/path`, no query strings).
- No `alert/confirm/prompt` (use in-page dialogs).
- `localStorage` may throw (wrap in try/catch).
- No network calls except our own files; Google Fonts are allowed.
- With no server present, the in-browser engine runs everything. With `/api/config` reachable, the same UI talks to the real server ("Live server" badge).

---

## 9. UI/UX problems today (what to fix)

1. **Too many screens at once.** The demo desk shows 4 panes (band, tablet, two staff phones) in small text. Judges don't know where to look.
2. **The viewer has to remember the story.** Clicking between panes and tabs loses the thread: "what just happened, and why?"
3. **Too much data.** Packet hex logs, sensor readouts, audit trails, level ladders and timestamps are all visible at the same time.
4. **Developer words.** "L2", "escalate", "acknowledged", "rid", "epoch" and "hash chain" are words teachers and students don't use.
5. **Tables instead of decisions.** The heatmap is a grid of numbers; the report is six tiles; staff must interpret.
6. **Slow to show.** Learning takes 20 s, then waiting for the band to ask. Time travel is hidden in small buttons. The full story takes too long.
7. **No guidance.** Nothing says "now press this" or "this is what Ms Khan sees".
8. **Not Indian-classroom friendly.** English only, small tap targets, heavy text for young children.

---

## 10. UI/UX principles (every screen must follow these)

1. **One screen, one job.** Each screen answers one question for one person ("Who needs me today?", "How do I ask for help?").
2. **Three things max.** A home screen shows at most 3 cards that need action. Everything else is one tap away.
3. **Plain words, teacher words.**

   | Instead of | Say |
   |---|---|
   | L1 / L2 | "With Ms Mehta" / "Moved to counsellor" |
   | acknowledged | "Someone is coming" |
   | escalated | "Moved up because no one replied" |
   | resolved | "Closed" |
   | hash chain intact | "History can't be changed ✓" |

4. **Always show who and when.** Every request shows *who has it* and *by when*, with a friendly countdown ("Reply by 3:30 pm · 4 h left").
5. **Big, friendly, tappable.** Minimum 48 px targets; tablet buttons at least 120 px tall; icons and emoji with every label; junior mode uses pictures first.
6. **Bilingual.** English / हिन्दी toggle everywhere (content strings in `i18n/en.json`, `i18n/hi.json`). Use Noto Sans Devanagari.
7. **Calm colours, red only for help.** Purple = brand, green = done or safe, amber = time running out, red **only** for help now.
8. **Progressive disclosure.** Technical detail (packets, receipts, audit history, model card) lives in an **"Under the hood"** drawer that is closed by default.
9. **Show, then tell.** Every state change animates (buzz, card moving from one person to another, clock ticking) and a one-line caption explains it.
10. **Kind tone.** "Thank you for telling us." Never blame, never alarm. No red badges on the child's screens.
11. **Helplines always visible:** a slim footer "Need help now? Childline 1098 · Emergency 112 · Tele-MANAS 14416" on every screen.
12. **Accessible:** WCAG AA contrast, keyboard operable, `aria-live` for buzz and status changes, reduced-motion support.

---

## 11. Screen-by-screen specification

Navigation:
- The app opens on **Start** (#home).
- A role switcher ("View as…") is the only global control, plus the language toggle and the "Story" button.
- Each role has **at most 4 bottom tabs** on mobile (a left rail on desktop).

### 11.1 Start (#home)

- **Hero:** "Every child can ask. Every request gets an answer." with a small animated band.
- **Two big buttons:**
  - **▶ Watch the 6-minute story** (opens Story Mode);
  - **Try it yourself** (opens the role picker).
- Three short value lines with icons:
  - "Band asks first";
  - "Reply clock moves up on its own";
  - "Teaches feeling words, shows class mood with no names".
- Small print: "Team Monarch prototype for PRASUNEX Innovathon 2026. Demo data only. Not a PRASUNEX product."

### 11.2 Role picker (#people)

- Large cards with a face/avatar, name and one-line role ("Ms Mehta: Riya's chosen adult and class teacher of 7B").
- Grouped: **Students**, **Teachers**, **Counsellor and wellness**, **Leaders**, **Parent**, **IT**.
- The demo cast (fixed):

| Person | Role |
|---|---|
| Riya Sharma | 7B, band 1001, chose Ms Mehta |
| Aarav Gupta | 7B, close to "goes quiet" |
| Meera Joshi | 7B, health profile adds the nurse |
| Dev Malhotra | 4A, junior mode |
| Ms Anjali Mehta | Class teacher 7B |
| Mr Rohan Verma | Teacher |
| Ms Priya Nair | Teacher |
| Ms Farah Khan | Counsellor |
| Ms Kavita Rao | POCSO officer |
| Mr Suresh Iyer | Principal |
| Nurse Meena Das | Nurse |
| Mrs Leela D'Souza | Management |
| Mr Arjun Patel | IT admin |
| Mrs Sunita Sharma | Riya's parent (new) |
| Mr Vikram Rao | Wellness teacher (new) |

### 11.3 Student: class tablet / portal (#student)

**Home (one screen, no scrolling on a tablet):**
- Greeting: "Hi Riya 👋" + small band status ("Band connected · 64%").
- **Status card (only if something is open):**
  - "Your message is with **Ms Mehta**. She'll reply by **3:30 pm**.";
  - after a reply: "**Ms Khan replied** 💬 Tap to read".
- **4 big buttons (2×2), icon + 2–3 words, Hindi underneath:**
  1. 💬 **Talk to my adult** (बात करनी है)
  2. 🙂 **How I feel** (मैं कैसा महसूस करता/करती हूँ)
  3. 🤝 **Worried about a friend** (दोस्त की चिंता)
  4. 🛟 **I need help now** (अभी मदद चाहिए): red, hold 2 s with a filling ring
- A small link under the grid: "Something about a teacher or staff?" (staff report; deliberately not a big button, but always reachable).
- **"Feeling of the week"** small card at the bottom.
- Helpline footer.

**Talk to my adult (3 steps, one per screen, with a progress dots bar):**
1. "Who do you want to talk to?" The chosen adult is preselected; "Change" opens big adult cards.
2. "How are you feeling?" Feeling cards (optional, skip allowed).
3. "Want to say more?" A text box (optional) + a microphone icon placeholder (labelled "coming soon"). Then **Send**.
4. Confirmation: big tick, "Sent to Ms Mehta. She'll reply by 3:30 pm. If she can't, Ms Khan will." The band buzzes once in the story.

**How I feel:**
- Grid of feeling cards (junior: 6 big faces; teen: 10).
- Tap → the card flips to show the meaning and a coping tip, with "Save" / "Save and talk to my adult" buttons.
- Shows **"My week"** (7 faces).

**Worried about a friend:** what's happening (text) + feelings → send. The confirmation explains: "Your name is hidden. Only if the principal and counsellor both agree can they see it, and they'll tell you."

**Help now:**
- Hold 2 s.
- Full-screen calm red: "Help is on the way. Ms Khan, Mr Iyer and Ms Rao have been told."
- "Cancel (60 s)" button with a countdown.
- When acknowledged: "Ms Khan is coming 🧡".

**My conversations:**
- A list of simple chat threads, each with a status sentence.
- A thread view looks like WhatsApp: bubbles, the adult's name and time.
- A collapsible **"Who has opened this?"** with names and reasons.

**Junior mode (Dev, 4A):** same layout, bigger faces, fewer words, read-aloud icon on each button (text-to-speech via the browser if available; hidden if not).

### 11.4 Virtual band (#band and inside the story)

- **A beautiful band** (strap + round screen + one big button) in the centre, large.
- **Under it, only:**
  - a caption line explaining the last buzz;
  - a **heart-rate dial** with a "normal for Riya" marker;
  - **two buttons:** "😌 Calm" / "😟 Tense";
  - a toggle "Sitting / Moving".
- **"Demo speed" chip:** "Learning compressed from 2 weeks to 10 seconds."
- **"Under the hood" drawer (closed by default):**
  - packet log with colour-coded bytes (ver | ID | counter | type | code);
  - receipts with "✓ verified with band key";
  - gateways in range with power switches;
  - "cut the internet";
  - "replay last packet" and "tamper a byte" buttons;
  - baseline numbers per time of day;
  - threshold;
  - the questions-today counter (max 3).
- The button supports tap, double tap, triple tap, hold-to-talk (junior), and hold 5 s + press to confirm help. A hold ring fills around the button.

### 11.5 Chosen adult / teacher (#teacher): Ms Mehta

**Tabs:** **Today** · **My class** · **Inbox**

**Today:**
- A big friendly line: "**1 child needs you today**".
- **Request cards** (max 3 visible). Each card shows:
  - the child's name and class;
  - how they asked ("3 taps on band");
  - their feelings as emoji;
  - the countdown chip ("Reply by 3:30 pm · 4 h 50 min left", amber when under 20%);
  - one primary button: **Reply**.
- Opening a card asks for a reason first. This is a quick sheet with 4 preset chips ("Assigned to me", "Riya chose me", "Help alert", "Escalated to me"), and it notes "Riya will see this".
- **Reply sheet:**
  - the child's words;
  - **3 suggested first replies** (tap to fill, editable);
  - Send;
  - after sending: "Clock stopped ✓ Riya can see your reply."
- "Moved on" notes appear softly: "Riya's message moved to Ms Khan because the deadline passed."

**My class (class teacher):**
- A **class weather card for 7B**: ⛈️ "7B has felt tense for 3 days."
- **Top feelings this week** (chips, only if 10+ answers).
- **Suggested 10-minute activity** card (title, steps, "Done in class" button).
- A small 10-day strip (coloured dots, hidden days shown as "not enough answers").
- "**No names are ever shown here.**"

**Inbox:** notifications as a simple list (quiet notes like "Several hard days" or "Quiet check-ins").

### 11.6 Counsellor (#counsellor): Ms Khan

**Tabs:** **Urgent first** · **All requests** · **Insights** · **Inbox**

**Urgent first (queue), grouped:**
1. 🔴 **Help now** (any unacknowledged; big "I'm going" button inline).
2. 🟠 **Prerana AI: may be urgent** (badge with reasons).
3. 🟡 **Due soon** (sorted by deadline).
4. ⚪ **Waiting**.

Each row has: name · class · feelings emoji · one-line status · countdown.

**Case view (one column, top to bottom):**
- A header with the name, class and one sentence: "Asked by 3 taps at 10:40. Moved to you at 3:30 because Ms Mehta didn't reply."
- **A simple journey line** (4 dots: Ms Mehta → **You** → Principal → Management; you are highlighted).
- **Countdown chip.**
- The **Prerana AI hint** box (if any): "May be urgent: mentions 'they hit me', feeling: scared. *Hints only raise priority. You decide.*"
- **Feelings timeline** (14 faces, if consent).
- The chat (bubbles) + reply box with 3 suggestions.
- **Actions** (max 3 visible, the rest under "More"):
  - visible: **Reply**, **Book a talk** (time chips), **Inform parent** (logged note);
  - under "More": Close, Request reveal (friend reports), Mark as safe.
- A collapsed **"History"** (audit timeline + "History can't be changed ✓").
- A collapsed **"Who opened this"**.

**Insights:**
- School class-weather grid (all classes as weather icons).
- Feelings-pattern notes.
- "Goes quiet" notes.

### 11.7 Wellness teacher (#wellness): Mr Vikram Rao

- One list: **"Check in today"**, quiet notes only. Examples:
  - "Aarav hasn't answered the band 3 times. Maybe say hi.";
  - "Band 1007 silent all day (charge or check fit)".
- Each note has one button: "Done, I checked in".

### 11.8 POCSO officer (#pocso)

- **Help now** and **Staff reports** only.
- Staff report view states clearly: "The named staff member can't see this."

### 11.9 Principal (#principal): Mr Iyer

**Tabs:** **Overview** · **Report** · **Help alerts** · **Devices**

**Overview (3 big numbers, traffic-light colours):**
- "**92%** answered on time";
- "**50 min** median first reply";
- "**1** request moved up today".

Plus "**0 unanswered at all levels**" (green) or a red card if any.

**Report:**
- A one-page printable report (bars for by type / by channel), "Export CSV" and "Print / Save PDF" (in-page print view).
- The basis line (Supreme Court 2025).
- **Counts only**, a clear statement.

**Help alerts:** an office-panel style list with live red banners.

**Devices:** traffic-light cards per gateway (online / "No gateway heard since 8:35 am") + "bands to charge tonight".

### 11.10 Nurse (#nurse)

Help-now alerts for children with a health-profile flag, showing "Health note: nurse added" (no medical details beyond the flag).

### 11.11 Management (#management)

- "Unanswered at every level" list (usually empty, celebratory empty state).
- School-level response numbers.

### 11.12 Parent (#parent): Mrs Sunita Sharma

- "Riya's band" card: sensing **On** (switch, with an explanation of what is and isn't collected).
- **Messages from the counsellor** (only what the counsellor chose to share).
- "What Prerana Pulse never does": no automatic alerts to parents, no raw heart data, never used for marks or discipline.
- Helplines.

### 11.13 IT admin (#admin)

- Gateways (traffic lights, last heard, messages today), bands (battery, last heard, revoke), provisioning instructions.

### 11.14 Anonymous class check-in (#checkin)

- Full-screen tablet kiosk: "How was your week?"
- 6-digit class code (pre-filled in demo).
- 5 big faces, then optionally "Pick a feeling" (one tap).
- "Thanks! Counted for 7B, never with your name." Resets in 3 s.

### 11.15 Under the hood (#tech): for technical judges

One page, sectioned, all optional:
1. Architecture diagram.
2. Live packet log.
3. Receipt verification.
4. Exactly-once demo (send the same packet via two gateways → one case).
5. Replay / tamper rejected.
6. Audit chain verify + tamper detection.
7. Row-level security explanation.
8. **Prerana AI model card** (type, data size, held-out accuracy, urgent recall, confusion matrix, "only raises priority").
9. Test results summary.

---

## 12. The demo experience: Story Mode (#story)

**Goal:** a judge understands the whole product in **6 minutes** without remembering anything, and the presenter never hunts for buttons.

### 12.1 Layout

- **Top:** a chapter timeline (7 dots with short names); the current one highlighted.
- **Left (≈35%): the "child side"**, showing the band or Riya's tablet as a device frame.
- **Right (≈65%): the "adult side"**, showing the one staff phone that matters in this chapter (Ms Mehta, Ms Khan, the principal, or the class teacher) in a phone frame.
- **Bottom: a narration card** (2 lines max, English/Hindi) + **[◀ Back] [Do it for me ▶] [Next ▶▶]**.
  - "Do it for me" performs the action (taps the band, sends, jumps the clock) with a visible animated cursor/finger.
  - The presenter can instead click the real buttons themselves.
- **"What just happened" rail** (right edge, collapsible): a plain-language running log ("10:41 Riya tapped twice: not great (private)"). This solves "remember what's happening".
- **School clock** chip at the top right ("Fri 10:40 am"), with an animated fast-forward when time jumps.
- A **spotlight** dims everything except the element the narration talks about.
- Keyboard: → next, ← back, Space = do it, R = restart.

### 12.2 The 7 chapters (each about 45–60 s)

| # | Chapter | Child side | Adult side | Narration (short) |
|---|---|---|---|---|
| 1 | **Meet Riya** | Band on Riya's wrist, "Learning her normal" (fast) | Nothing / school intro card | "Riya, Class 7B. Her band spent two weeks learning her normal heart rate. In the demo, ten seconds." |
| 2 | **The band notices, then asks** | HR rises while still → three soft buzzes → "Are you okay?" → **2 taps** → calm-down pulses | Ms Mehta's phone: **nothing** happens (privacy) | "It asks; it never guesses. 'Not great' stays private. Nobody is alerted." |
| 3 | **Name the feeling** | Tablet: "Earlier you said not great. Want to name it?" → picks **Left out**, **Scared** → feeling card teaches meaning + tip | Ms Mehta: a gentle note "Several hard days: Riya has said not great on 5 of the last 10 days and was asked if she wants to talk" | "Children learn feeling words. Five hard days in two weeks: Riya is asked first, then her adult." |
| 4 | **Three taps: I want to talk** | 3 taps → one buzz ("the school has it") | Ms Mehta: request card "Reply by 3:30 pm" | "One buzz only comes back when the school has really saved it." |
| 5 | **Nobody replies, so it moves up** | Tablet: "Your message moved to Ms Khan. She'll reply by 12:00 tomorrow." | Clock fast-forwards to **3:31 pm** → card animates from Ms Mehta's phone to **Ms Khan's** → Ms Khan opens with a reason → **Prerana AI hint** (if Riya wrote "they hit me in the bus"), feelings timeline → reply with a suggestion → "Clock stopped ✓" | "Silence is visible. Only a real reply stops the clock. AI hints only raise priority; Ms Khan decides." |
| 6 | **Help now** | Hold 5 s + press → "Help is on the way" | Three phones light up (counsellor, POCSO, principal) → fast-forward 10 min → SMS + call cards → "I'm going" → child sees "Ms Khan is coming" | "Three people at once. If no one answers in 10 minutes, SMS and calls until someone does." |
| 7 | **The school learns, without names** | Class check-in kiosk: a few faces | Class teacher: **7B ⛈️ tense 3 days** → top feelings "left out" → **10-minute activity "Two kind things"** → principal: **92% on time** report | "Teachers get an activity, not a list of names. The principal gets the Supreme Court response report." |

**End card:**
- "Every child can ask. Every request gets an answer."
- Three buttons: **Try it yourself** · **Under the hood** · **Restart story**.
- Helplines line.

**Optional extra chapter (only if asked): "When things fail".** Both gateways off → two buzzes → one comes back → one buzz, one copy saved. Lives in "Under the hood".

### 12.3 Presenter controls

- **Reset demo** (restores Fri 10:40 am and fresh data) in a small menu.
- **Present mode:** hides the browser chrome feel, enlarges text 115%, and keeps the narration readable on a projector.
- **Auto-play:** plays all chapters with pauses (for recording the video).
- Works fully offline once loaded.

---

## 13. Visual design system

- **Feel:** warm, calm, friendly; not clinical and not a dashboard.
- **Colours:**

  | Role | Hex |
  |---|---|
  | Brand purple | #6C4CF1 (ink #4B2FD6, soft #EEEAFE) |
  | Ink | #0F172A |
  | Background | #F8F7FF |
  | Safe/done green | #0F9D6B |
  | Time-running amber | #B45309 / #FEF3E2 |
  | Help red | #DC2626 (only for help now) |

  Feeling colours are soft pastels, one per feeling (also always with an emoji and a word, never colour alone).
- **Type:** Plus Jakarta Sans (headings 700–800, body 400–600) + Noto Sans Devanagari for Hindi.
  - Body 16 px (tablet 18 px), headings 24–40 px.
  - Numbers tabular.
- **Shapes:**
  - rounded cards (16 px radius), soft shadow, generous white space;
  - device frames for band / tablet / phone in Story Mode;
  - a 4-dot "journey line" component for escalation.
- **Components to build once:**
  - Button, BigTile (student), Card, CountdownChip, FeelingCard (flip), JourneyLine, PersonAvatar, StatusSentence, ChatBubble, ReasonSheet, Toast, Drawer, DeviceFrame, BandWidget, WeatherIcon, KPI, HelplineFooter, LanguageToggle, NarrationCard, ChapterTimeline, Spotlight, StoryRail.
- **Motion:**
  - band buzz (shake + rings);
  - calm-down (slow scale breathing);
  - a card flying between phones on escalation;
  - a countdown ring;
  - confetti-free celebration (a soft green tick) when a reply stops the clock;
  - all motion ≤ 400 ms except breathing; `prefers-reduced-motion` respected.
- **Icons:** one consistent outline icon set (e.g. Lucide); emoji only for feelings and weather.

---

## 14. Making it interesting (delight details judges will remember)

1. **The band feels physical.** A large, glossy band with a real button; the hold ring fills; buzz rings animate; optional haptics on phones (`navigator.vibrate`).
2. **The card that travels.** When the clock runs out, the request card visibly flies from Ms Mehta's phone to Ms Khan's. This is the "aha" moment of the reply clock.
3. **The child's side always reassures.** "Ms Mehta will reply by 3:30 pm", then "Ms Khan has it now", then "Ms Khan replied 💬". Judges see that the child is never left wondering.
4. **Feeling cards flip** to teach the word, in English and Hindi, with a tip. It's emotional intelligence you can see.
5. **Class weather icons** instead of numbers: instantly readable by any teacher.
6. **A Prerana AI hint with reasons**, plus a visible "only raises priority" promise, shows responsible AI.
7. **"Who opened my case"** shows privacy as a feature the child can see.
8. **A time-travel clock animation** ("⏩ 3:31 pm") makes deadlines tangible.
9. **The "What just happened" rail** turns the demo into a story anyone can follow.
10. **Hindi toggle live on stage:** flip the language mid-demo; everything changes. It's a strong signal for Indian schools.

---

## 15. Build plan (all in one go)

### 15.1 Tech choices for the rebuild

- **Frontend:** React 18 + TypeScript + Vite.
  - Tailwind CSS (or CSS modules) with the design tokens above.
  - Framer Motion for animation.
  - Lucide icons.
  - i18next (en, hi).
  - Build a **PWA** (manifest + icons; no service worker needed for the hosted demo).
  - Output to `web/dist/` with `base: './'` (relative paths) so the same build runs from FastAPI **and** as a static hosted page.
- **Routing:** a tiny hash router that only uses plain names (`#home`, `#story`, `#student`, `#band`, `#teacher`, `#counsellor`, `#wellness`, `#pocso`, `#principal`, `#nurse`, `#management`, `#parent`, `#admin`, `#checkin`, `#tech`, `#people`).
- **Data layer:**
  - `src/api/client.ts` with two transports, **live** (`fetch('api/...')` + EventSource) and **demo** (the in-browser engine);
  - auto-detected via `api/config` (JSON content type check);
  - one interface, so views never know which is used.
- **Engine:**
  - port `web/js/engine.js` and `crypto.js` to `src/engine/` (TypeScript), keeping byte-identical crypto;
  - add every new feature (feelings, rules, wellness, parent, AI urgency using `ml/model.json`, story steps);
  - keep the Node tests (`web/tests/engine.test.mjs`, rewritten in Vitest) green.
- **Backend:**
  - add the new tables, columns, endpoints and rules to FastAPI;
  - keep the 19 existing pytest tests passing and add new ones.
- **ML:**
  - `ml/data/messages.csv` (team-written, labelled, en/hi/Hinglish, no real data);
  - `ml/train.py` (scikit-learn, prints metrics, writes `ml/model.json` + `ml/model_card.json`);
  - `backend/app/urgency.py`;
  - `src/engine/urgency.ts`.
- **E2E and video:**
  - Playwright script `tools/e2e_story.py` that runs Story Mode auto-play end to end, asserts each chapter's outcome, and records a 1920×1080 video;
  - must pass against both the in-browser engine and the live server.

### 15.2 Folder layout

```
web/
  index.html  vite.config.ts  package.json
  public/ manifest.webmanifest icons/
  src/
    main.tsx  App.tsx  router.ts  i18n/{en,hi}.json
    api/client.ts  api/types.ts
    engine/{engine.ts, crypto.ts, band.ts, calendar.ts, rules.ts, urgency.ts, data.ts, story.ts}
    design/{tokens.css, components/*.tsx}
    screens/{Home, People, Story, Student/*, Band, Teacher/*, Counsellor/*, Wellness, Pocso, Principal/*, Nurse, Management, Parent, Admin, Checkin, Tech}.tsx
  tests/ (vitest)
ml/ data/messages.csv  train.py  model.json  model_card.json
backend/ (existing + new endpoints, rules, urgency.py, tests)
tools/ e2e_story.py
```

### 15.3 Build order (one session, everything)

1. Design tokens + shared components + i18n + hash router + API client.
2. Engine port + new features + Vitest.
3. ML dataset, training, model export; Python and TS inference; tests (an Urgent hint never lowers priority).
4. Backend additions + tests.
5. Every screen in Part 11.
6. Story Mode (Part 12) with Do-it-for-me actions driven through the same API.
7. Under the hood page.
8. Playwright E2E + video; screenshots of every screen at 1440×900 and 390×844, reviewed for clutter.
9. Update `README.md`, `docs/TECHNICAL.md`, `docs/DEMO_SCRIPT.md`.

---

## 16. Acceptance checklist

**Simplicity:**
- [ ] No screen shows more than 3 action cards or more than one primary button per card.
- [ ] No developer words on any non-tech screen (grep for: L1, L2, escalat, acknowledg, rid, epoch, hash).
- [ ] Every request shows who has it and by when.
- [ ] A first-time viewer can follow Story Mode with no presenter speaking (captions alone).
- [ ] Story Mode runs start to finish in ≤ 6 minutes with "Do it for me".

**Features:**
- [ ] Every row in Part 5 and Part 6 works (or is labelled simulated per Part 17).
- [ ] Helplines 1098 / 112 / 14416 appear on every screen.
- [ ] Junior mode works (Dev): one tap okay, hold to talk, big faces.
- [ ] The band asks again after 10 min, logs skipped, and asks at most 3 times a day.
- [ ] The goes-quiet, band-silent, keeps-not-okay, class-tension and feelings-pattern rules all fire in the demo data.
- [ ] Prerana AI hint: shown with reasons; only raises priority (tested); model card shows real held-out metrics.
- [ ] Parent screen: consent switch works; no automatic alerts.
- [ ] Staff report never reaches the named person (tested).
- [ ] Friend report reveal needs principal + counsellor (tested).
- [ ] Hindi toggle changes all UI strings.

**Quality:**
- [ ] The existing 19 backend tests and the engine tests pass, and the new tests pass.
- [ ] Playwright Story run passes against the in-browser engine and the live server.
- [ ] Lighthouse accessibility ≥ 90; keyboard works; reduced motion works.
- [ ] Hosted build works from static files with relative paths and plain hash routes; no console errors.

---

## 17. Honesty rules (what we may claim)

- **Built and tested:**
  - the server, the band protocol and receipts, the gateway program, the in-browser engine;
  - the web app, the virtual band, the rules;
  - the urgency classifier (with its actual measured metrics).
- **Simulated (label in the UI with a small "simulated" tag):**
  - SMS and calls ("logged, not sent");
  - the PRASUNEX ERP (sample roster);
  - Prerana AI activity drafting (reviewed library);
  - FCM push (in-app notifications);
  - sign-in (demo picker).
- **Written, not tested:** band firmware (no hardware this round), the gateway Bluetooth mode, Docker Compose.
- **Never claim:**
  - that the band detects emotions, diagnoses, or detects emergencies;
  - medical accuracy;
  - that AI decides anything.

  Wording to use: "The band asks; it never guesses the feeling." "Hints only raise priority; a person decides."
- Planning numbers (Part 7.6) are assumptions, not measurements, except the measured 386 messages/s.
- All demo names are made up. The hosted page is labelled a Team Monarch prototype, not a PRASUNEX product.

---

## 18. Prompt for Claude Code (copy everything below into Claude Code, from the repository root)

```
You are rebuilding the Prerana Pulse prototype (Team Monarch, PRASUNEX Innovathon 2026). Read document.md in full first. It is the single source of truth: the problem, every feature and rule, the data model, the APIs, the screens, the demo, the design system and the acceptance checklist. Everything promised there must exist when you finish. Do the whole build in one go, not feature by feature across sessions.

Context
- The repository already contains a working FastAPI + PostgreSQL backend (backend/), a gateway program (gateway/), untested ESP32 firmware (firmware/), and a vanilla-JS web app (web/js, web/css) with an in-browser copy of the server (web/js/engine.js) and browser crypto (web/js/crypto.js) that matches Python byte for byte. Keep the backend, gateway, firmware, crypto and engine logic. Replace the web UI.
- The current UI is confusing: four panes at once, too much data (packet logs, ladders, audit trails), developer words, and a demo that makes the viewer remember what happened. Your main job is to make it simple, calm and obvious for Indian students (classes 3 to 12) and Indian teachers who are busy and not technical.

What to build
1. A new React 18 + TypeScript + Vite PWA in web/ (build output web/dist with base './'), Tailwind or CSS modules using the design tokens in Part 13, Framer Motion, Lucide icons, i18next with English and Hindi. Plain hash routes only (#home, #story, #student, #band, #teacher, #counsellor, #wellness, #pocso, #principal, #nurse, #management, #parent, #admin, #checkin, #tech, #people). The same build must run from FastAPI and as static files on a hosted page with no server (it then uses the in-browser engine). No alert/confirm/prompt; wrap localStorage in try/catch; no external network calls except Google Fonts.
2. A single API client with two transports (live server via fetch + EventSource, or the in-browser engine), auto-detected through api/config. Views must not know which one is active.
3. Port engine.js, crypto.js and band.js to TypeScript under web/src/engine and add every new feature from Parts 5 and 6: feelings (teen and junior packs, English and Hindi, meanings and coping tips, feeling of the week), name-the-feeling after "not great", My week, the counsellor feelings timeline with consent, the feelings-pattern rule, the band-silent rule and wellness teacher role, "asks again in 10 minutes", at most 3 questions a day, junior mode (one tap okay, hold to talk), time-of-day baselines and threshold tuning on the virtual band, parent consent, reply suggestions, class weather, activities with "Done in class", and story steps. Keep the crypto byte-identical and port the existing engine tests to Vitest.
4. The Prerana AI urgency hint as a real, small ML model: write a labelled dataset (600 to 900 short messages in English, Hindi and Hinglish, labels normal/soon/urgent, no real children's data) at ml/data/messages.csv; ml/train.py trains hashed char n-gram + word features with logistic regression, prints held-out accuracy, per-class recall and a confusion matrix, and writes ml/model.json and ml/model_card.json. Add a hard safety phrase list that always returns urgent. Serve it from backend/app/urgency.py and web/src/engine/urgency.ts using the same model.json. Hints may only raise priority, never lower it, never act on their own; test that. Show the real metrics on the model card. Never invent metrics.
5. Backend additions: the new tables and columns in Part 7.4, the new endpoints in Part 7.5, the new rules, wellness and parent roles, AI urgency on case creation and child messages. Keep the existing 19 pytest tests passing and add tests for every new rule and permission.
6. Every screen in Part 11, following the principles in Part 10: one job per screen, at most 3 action cards, plain teacher words (no L1/L2, escalate, acknowledge, hash, epoch on normal screens), always "who has it and by when", big friendly tap targets, emoji with feelings, red only for help now, helplines (Childline 1098, Emergency 112, Tele-MANAS 14416) on every screen, technical detail only in the Under the hood drawer or #tech page.
7. Story Mode (#story) exactly as Part 12: child side and adult side in device frames, chapter timeline, narration card, Do it for me / Next / Back, the "What just happened" rail, spotlight, animated time jumps, the request card visibly moving from Ms Mehta's phone to Ms Khan's, auto-play for recording, present mode, keyboard shortcuts, reset. Seven chapters, six minutes total.
8. tools/e2e_story.py (Playwright): runs Story Mode auto-play, asserts each chapter's outcome, records a 1920x1080 video; it must pass against the in-browser engine (static server on web/dist) and the live stack (./run_local.sh).
9. Update README.md, docs/TECHNICAL.md and docs/DEMO_SCRIPT.md to match.

How to work
- Before coding, brainstorm the UX briefly from the point of view of a 12-year-old with no phone, a busy class teacher with 40 students, a counsellor with 900 students, and a principal who needs a compliance report. Cut anything that does not help one of them.
- Build shared components first (Part 13), then the engine and ML, then backend, then screens, then Story Mode.
- After the screens exist, take screenshots of every screen at 1440x900 and 390x844 and look at them. Remove clutter: if a teacher would need more than 3 seconds to know what to do, simplify it. Check the Hindi version too.
- Run all tests (pytest, vitest, Playwright) and fix failures before you finish.
- Follow Part 17 (honesty rules) everywhere in the UI and docs: label simulated parts, never claim the band detects emotions, never claim AI decides.
- Finish only when every box in Part 16 is ticked. Report what you built, test results, the measured model metrics, and anything you could not finish.
```
