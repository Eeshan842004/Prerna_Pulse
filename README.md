# Prerana Pulse

**A band that notices, and a school that answers on time.**
Team Monarch's prototype for the PRASUNEX Innovathon 2026. This is a student team's work, not a PRASUNEX product.

The child uses **only the band**: no phone, no tablet, nothing typed. Adults use one simple phone app.

- The band learns the child's normal heart rate. When it stays clearly higher while she sits still, it gives a small vibration **only she feels** and shows "How are you?" with a list of feeling words. She picks one with its one button. A matching 1-minute exercise runs on her wrist. One bad day stays private.
- The **same difficult feeling on 5 of the last 10 school days** reaches the counsellor, with the name.
- "Talk to someone" goes to the adult the child chose, with a deadline. The adult answers by calling her to a room ("Ms Khan will see you at lunch, Room 12" appears on the band). No answer in time and it moves up on its own: counsellor, principal, management.
- **SOS** (hold 5 seconds, then tap) alerts the counsellor, principal and class teacher at once, with her live location in school, and repeats by SMS and call until someone goes.
- **PT mode** pauses asking during sports. Parents control consent and hear only from the counsellor.

| | |
|---|---|
| **Present it** | `docs/PPT_CONTENT.md`: the workflow, mechanism, features and slide order for the PPT |
| **Flowcharts** | `docs/flowcharts/`: how the band works, and how teachers and counsellors stay in the loop |
| **Video** | `docs/Prerana_Pulse_v2_walkthrough.mp4` (flowcharts, then the full live story) |
| **Technical documentation** | [`docs/TECHNICAL.md`](docs/TECHNICAL.md) |
| **Demo script** | [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): the story, "Try it yourself", and a backup plan |

## Run it

### Option A: just the web app (no install, fastest for a demo)

```bash
python -m http.server -d web 8090      # then open http://localhost:8090
```

With no server present, the page runs an in-browser copy of the server rules (`web/js/engine.js`). The top-right badge says "Runs in your browser".

### Option B: the real stack, with a local PostgreSQL 14+

```bash
./run_local.sh            # installs packages, creates the database, starts the API and 6 gateways
# open http://localhost:8000     (badge: "Live server")
```

`run_local.sh` starts the API with `python -m app.serve` (this also works on Windows) and one gateway process per place on the school map (ports 8081-8086). `gw-blockb` is deliberately left off so the principal's Devices tab shows a silent gateway.

### Option C: Docker

```bash
docker compose up --build
# open http://localhost:8000
```

We could not run Docker in our build environment, so this follows the same steps but has not been run by us.

## Tests

```bash
# server: real PostgreSQL (row-level security and SKIP LOCKED are PostgreSQL features)
cd backend && pip install -r requirements-dev.txt
PP_TEST_OWNER_DSN=postgresql://postgres@localhost/prerana_test \
PP_TEST_APP_DSN=postgresql://pp_app:pp_app@localhost/prerana_test python -m pytest -q     # 41 tests

# the in-browser engine (same rules)
node web/tests/engine.test.mjs                                                           # 17 tests
```

The 41 server tests are 25 end-to-end rule tests, 9 HTTP permission tests and 7 protocol tests. They cover: exactly-once delivery from two gateways, replay and forgery rejection, a single feeling staying private, the 5-of-10-days rule reaching the counsellor (and not before), the reply clock moving up and Call to talk stopping it, SOS alerting three people with a location that follows the child, SMS and call repeats with a daily cap, PT mode, class weather hiding groups under 10, parents never alerted automatically, encrypted parent messages, silent-band notices, the emotion model beating its baseline, the tamper-evident history, and row-level security between schools.

## Repository

```
backend/    FastAPI + PostgreSQL server: ingest, receipts, reply clocks, SOS and location, rules,
            class weather, the per-child emotion model, audit chain, and tests
gateway/    gateway.py: forwards band messages (and signal strength) to the server; queues to disk when offline
web/        the web app: Watch the story, Try it yourself, Under the hood, the four adult apps, the virtual band
            js/engine.js is the in-browser copy of the server used when no server is present
firmware/   band firmware for ESP32-C3 (written for the v1 message types, NOT updated or tested on hardware)
tools/      band_sim.py, provision_band.py (v1 helpers, not yet updated to the v2 message types)
docs/       technical docs, demo script, PPT material, flowcharts, videos
```

## Honest status

- **Built and tested:** the server (41 tests on PostgreSQL 16), the band protocol and receipts, the gateway program, the in-browser engine (17 tests), the virtual band (runs the firmware's logic), the four adult apps, the emotion model.
- **Simulated:** SMS and calls (logged as "mock"); the school ERP and timetable (sample data); push notifications (shown in the app); signal strength (set by the "Where is she?" control on the virtual band); sign-in (a person picker); class activities (a reviewed library instead of AI).
- **Written, not tested:** the band firmware (and it still uses the v1 message types), the gateway's Bluetooth mode, Docker Compose.
- **Emotion model:** a small per-child Naive Bayes model that only orders the band's menu; the child always confirms. Measured on simulated children (see the Under the hood page): modestly better than "most common feeling". Real accuracy needs a pilot. The band never detects emotions.

We had no hardware for this round. All names in the demo are made up.

## Deploy on Vercel (the web app, no server needed)

The web app is static, so Vercel serves the `web/` folder as is (config in `vercel.json`). With no API
present it runs on its in-browser engine, which is exactly what the demo needs. The Python server
(`backend/`) needs PostgreSQL and background workers, so it is not deployed on Vercel.

1. Go to https://vercel.com/new and import `Eeshan842004/Prerna_Pulse`.
2. Leave Framework Preset as "Other". Build and install commands stay empty; the output directory is `web`.
3. Click Deploy. The site opens at `https://<project-name>.vercel.app`.
