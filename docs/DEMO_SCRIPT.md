# Demo script (band-only version), about 6 minutes

**Setup (2 minutes before you present)**
1. Open the demo: run `python -m http.server -d web 8090` in the `prerana-pulse` folder and open http://localhost:8090 (no internet needed after the page loads).
2. Use a 1920×1080 screen at 100% zoom. Close other tabs.
3. Pick the language with the **English / हिन्दी** switch (top right). You can flip it live during the demo.
4. If anything looks odd, press **Restart** (story) or **Reset** (Try it yourself): the clock goes back to 10:40 am with a fresh school.

There are three ways to show it. Use **A** for most audiences, **B** if judges want to press buttons themselves, **C** if the laptop fails.

---

## A. Watch the story (recommended)

**How to run it:** click **▶ Watch the story** → press **Play the story**. It runs by itself, slowly. You only talk.

On screen: Riya's watch on the left, one adult's phone on the right (the name tag above it changes), the narration at the bottom, and the **Steps + What just happened** list on the right edge. A cursor moves to every button, each click flashes in colour, and a coloured arrow names what is happening. Under the watch, a yellow **What to do** box always says what the child is doing with the button.

**Controls:** **Pause** any time · **👆 Do it for me** = one step at a time (use this if you want to talk longer) · **⏮ / ⏭** = previous / next chapter · **🐢 Slow / 🐇 Normal** · keys: P = play/pause, Space = one step, ← → = chapters, R = restart.

| Chapter | What happens on screen | What to say (short) |
|---|---|---|
| 1 Meet Riya | The watch learns her normal heart rate; Ms Mehta's phone shows "Children who chose you: Riya" | "Riya, Class 7B. The band learned her normal heart rate. She chose Ms Mehta as the adult she trusts." |
| 2 The band notices | Heart rate rises in Maths while she sits still → private vibration → "How are you? ★ Worried" → she holds the button → breathing exercise → "Feel better?" → yes. Ms Mehta's phone: nothing. | "Only Riya feels the vibration. The model suggests Worried from her own past choices; she decides. One worried day stays private." |
| 3 PT mode | Double tap → PT / sports → 30 min. She runs: high heart rate, no question. Teacher sees "PT 11:20–12:00, sensing paused". | "No false alarms, and the band never comes off." |
| 4 A pattern | 1:30 pm. She picks Sad: her 5th sad day in 10. The counsellor's Patterns tab shows her name and 14-day feelings. | "One sad day is private. Five in two weeks reach the counsellor, with her name. Teachers never see this." |
| 5 Talk + reply clock | Talk to someone → My adult. Ms Mehta: "Respond by 3:30 pm". Clock jumps to 3:31 pm → the card flies to Ms Khan → Call to talk (lunch, counselling room) → the watch shows the message → Riya holds Okay → "Riya saw it ✓". | "Silence moves it up on its own. Only a real response stops the clock, and the talk happens in person." |
| 6 SOS | Hold 5 s → "Send SOS?" → tap. Principal, teacher and counsellor get a red banner. The map pin moves from Block A stairs to the Library corridor. Ms Khan taps I'm going → watch: "Ms Khan is coming". | "Who, and where, in seconds. If nobody goes in 10 minutes, SMS and calls repeat." |
| 7 The school learns | Teacher: 7B class weather + 10-minute activity. Principal: on-time %. Counsellor shares a note → the parent's phone shows it, plus "band worn today". | "Teachers get an activity, not names. Parents hear from the counsellor, never through an automatic alert." |

Before or after the story, open the **Start** page → **How it works** to show the two flowcharts (also in `docs/flowcharts/`).

---

## B. Try it yourself (hands-on)

Click **👆 Try it yourself**. Left: the watch. Right: a phone. The bar at the top chooses whose band and whose phone, and moves the clock. The **Try these** card ticks each task when it is done.

**The watch has ONE button, in the watch body under the screen (labelled BUTTON).** Click it directly on the watch:
- **Tap** = next word · **Hold 1 second** = choose · **Double tap** = open the menu · **Hold 5 seconds, then tap** = SOS.
- The yellow **What to do** box above the watch always tells you the next action.

| # | Task | Exactly what to click |
|---|---|---|
| 1 | Name a feeling | Double-tap the watch button → tap until the word you want → hold 1 s. A difficult feeling starts a 1-minute exercise (hold to stop early; tap at "Feel better?"). |
| 2 | Let the band ask | Under the watch, choose **😟 Tense, sitting** and wait about 10 seconds. The watch vibrates and asks "How are you?". |
| 3 | Turn on PT mode | Double-tap → tap to **PT / sports** → hold → hold (30 min). Then choose **🏃 Running**: no question comes. |
| 4 | Ask to talk | Double-tap → tap to **Talk to someone** → hold → **My adult** → hold. One short buzz = the school has it. |
| 5 | Answer as the teacher | Top bar: **Phone of → Teacher** → **Call to talk** → pick when and where → **Send to Riya's band**. Then on the watch, hold 1 s to say Okay; the phone shows "Riya saw it ✓". To show the reply clock instead, press **⏩ 3:31 pm** before answering and switch the phone to **Counsellor**. |
| 6 | Send an SOS | Phone of → **Counsellor**. Hold the watch button 5 seconds, then tap. Change **Where is she?** under the watch and watch the pin move. Press **I'm going** on the phone. |

Other people to try: **Dev · 4A (junior)** has a 6-word menu with big pictures. **Phone of → Principal** shows the response report and device health. **Phone of → Parent** shows consent switches.

---

## C. If something fails

| If… | Then… |
|---|---|
| No internet at the venue | The demo runs fully offline from `python -m http.server -d web 8090`. |
| A story step shows "This step did not finish" | Press **Play** again, or **Restart**. |
| The band doesn't ask in Try it yourself | Make sure **Tense, sitting** is selected (not Running), not in PT mode, and fewer than 3 questions today; press **Reset** if needed. |
| The laptop fails | Play `docs/Prerana_Pulse_v2_walkthrough.mp4` (flowcharts + the full story). |

## Questions judges may ask

- **"Does the band detect emotions?"** No. It notices a change in heart rate while the child is still, and asks. The child names the feeling. A small model only puts her most likely word first; she always confirms. Its accuracy on simulated children is on the Under the hood page; real accuracy needs a pilot.
- **"What about PE?"** PT mode (set by the child or by the timetable) pauses noticing, and the motion sensor stops questions while moving. SOS always works.
- **"What stops a prank SOS?"** Hold 5 seconds plus a confirming tap, cancel within 60 seconds, a daily cap on SMS repeats, and a first misuse means a talk, not a penalty.
- **"Why would a teacher answer?"** The deadline is visible; silence moves it to the counsellor, then the principal, and the principal's report shows on-time rates.
- **"Is location tracking?"** Location is shared only during an SOS, only inside school, at room level, and only with the SOS recipients.
- **"What is real?"** The rules engine, protocol, receipts, virtual band, model and apps are built and tested in this page (17 tests). SMS, ERP, timetable and signal strength are simulated. The FastAPI server is tested for the Round 2 rules; porting the band-only rules is next. Firmware is written but untested without hardware.
