#!/usr/bin/env python3
"""End-to-end test: plays Story Mode in a real browser, then checks what each chapter should have
left behind, by asking the app's own API. Works against the live stack and the in-browser engine.

    python tools/e2e_story.py http://localhost:8000/            # live stack (./run_local.sh)
    python tools/e2e_story.py http://localhost:8090/ --video out.webm   # static server: in-browser engine
    python tools/e2e_story.py http://localhost:8000/ --speed Slow

Needs: pip install playwright && playwright install chromium
Exit code 0 = every check passed."""
import argparse
import sys
import time

from playwright.sync_api import sync_playwright

CHECKS = """
async () => {
  const A = window.prerana; const out = [];
  const users = await A.get('/auth/demo-users');
  const login = async (n) => A.post('/auth/login', { user_id: users.find((u) => u.name === n).id });
  const khan = await login('Ms Farah Khan'), mehta = await login('Ms Anjali Mehta'), iyer = await login('Mr Suresh Iyer'), parent = await login('Mrs Sunita Sharma');
  const ok = (name, pass, detail = '') => out.push({ name, pass: !!pass, detail: String(detail) });

  // chapter 4: the 5th sad day reached the counsellor, with the name; a teacher can't see it
  const pats = await A.get('/patterns', khan.token);
  ok('4 pattern: counsellor sees Riya with "sad" on 5 days', pats.some((p) => p.student.name === 'Riya Sharma' && p.code === 3 && p.days >= 5), JSON.stringify(pats.map((p) => p.student.name)));
  let teacherBlocked = false; try { await A.get('/patterns', mehta.token); } catch (e) { teacherBlocked = e.status === 403; }
  ok('4 privacy: a teacher can never read individual feelings', teacherBlocked);

  // chapter 5: the request moved up on its own, Call to talk stopped the clock, Riya saw it
  const q = await A.get('/queue?include_closed=true', khan.token);
  const talk = q.find((c) => c.kind === 'talk' && c.student && c.student.name === 'Riya Sharma' && c.call);
  ok('5 reply clock: request ended up with the counsellor after the deadline', talk && talk.level === 2, talk && talk.level);
  ok('5 Call to talk responded and shows on the band', talk && talk.status === 'responded' && /Ms Khan will see you/.test(talk.message.text), talk && talk.message && talk.message.text);
  ok('5 the child pressed Okay: "Riya saw it"', talk && talk.message.seen === true);

  // chapter 6: SOS reached three people, with a location that followed the child, and someone went
  const sosAll = await A.get('/sos/history', khan.token);
  const sos = sosAll.find((c) => c.kind === 'sos' && c.student.name === 'Riya Sharma' && c.status !== 'resolved' && c.created_at >= (talk ? talk.created_at : ''));
  ok('6 SOS exists and was acknowledged', sos && sos.going_by && sos.going_by.label === 'Ms Khan', sos && sos.status);
  ok('6 SOS location followed the child (2+ places)', sos && sos.trail.length >= 2, sos && JSON.stringify(sos.trail.map((t) => t.gw)));
  const seen = {}; for (const [n, t] of [['principal', iyer], ['teacher', mehta], ['counsellor', khan]]) seen[n] = (await A.get('/sos/active', t.token)).length;
  ok('6 principal, class teacher and counsellor all see the SOS', seen.principal === 1 && seen.teacher === 1 && seen.counsellor === 1, JSON.stringify(seen));

  // chapter 7: nothing reached the parent automatically; only the counsellor's chosen message
  const home = await A.get('/parent/home', parent.token);
  ok('7 parent got exactly the one message the counsellor chose', home.messages.length === 1, home.messages.length);
  ok('7 parent sees the band was worn today', home.band && home.band.worn_today === true);
  const notes = await A.get('/notifications', parent.token);
  ok('7 no automatic alerts to the parent', notes.length === 0, notes.length);
  const rep = await A.get('/reports/response', iyer.token);
  ok('7 principal report has numbers', rep.cases >= 10 && rep.on_time_share != null);
  return out;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", nargs="?", default="http://localhost:8000/")
    ap.add_argument("--speed", choices=["Slow", "Normal"], default="Normal")
    ap.add_argument("--video", help="record a video to this path (.webm)")
    ap.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()
    url = a.url.rstrip("/") + "/"
    failures = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1920, "height": 1080},
                            **({"record_video_dir": "e2e-video", "record_video_size": {"width": 1920, "height": 1080}} if a.video else {}))
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url + "#story")
        pg.wait_for_selector("[data-demo=play]")
        pg.wait_for_timeout(3000)
        mode = pg.inner_text(".mode")
        print(f"app mode: {mode.strip()}")
        if a.speed == "Normal":
            pg.click("text=Normal")
        pg.click("[data-demo=play]")
        t0 = time.time(); chapter = ""
        while True:
            pg.wait_for_timeout(2000)
            ch = pg.inner_text(".n-ch").split("\n")[0] if pg.query_selector(".n-ch") else ""
            if ch and ch != chapter:
                chapter = ch; print(f"  {ch}")
            if pg.query_selector(".n-err"):
                failures.append("a story step did not finish: " + pg.inner_text(".sp-head").replace("\n", " "))
                break
            if pg.query_selector(".end-card"):
                print(f"story finished in {time.time() - t0:.0f} s")
                break
            if time.time() - t0 > a.timeout:
                failures.append("the story did not finish in time")
                break
        if not failures:
            for r in pg.evaluate(CHECKS):
                print(("  PASS " if r["pass"] else "  FAIL ") + r["name"] + ("" if r["pass"] else f"   [{r['detail']}]"))
                if not r["pass"]:
                    failures.append(r["name"])
        if errors:
            failures.append("page errors: " + "; ".join(errors[:3]))
        vid = pg.video.path() if a.video else None
        ctx.close(); b.close()
        if vid:
            import shutil
            shutil.move(vid, a.video); print("video:", a.video)
    print("\nPASSED" if not failures else "\nFAILED:\n  " + "\n  ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
