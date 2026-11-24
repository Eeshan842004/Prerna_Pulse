"""The emotion suggestion model ("Prerana AI on the band"): a per-child Naive Bayes classifier that
puts the most likely feeling first in the band's menu. The child always confirms; the model only
orders the menu. It is tiny (a few hundred counts per child), learns online from every confirmed
choice, and borrows a school-wide prior so new children get sensible suggestions on day one.

This is a port of web/js/model.js with the same maths, so the measured accuracy is the same."""
from __future__ import annotations

import math

CODES = list(range(1, 11))
FEATURES = {
    "tod": ["morning", "mid", "afternoon"],
    "dow": ["1", "2", "3", "4", "5", "6"],
    "period": ["Assembly", "English", "Hindi", "Science", "Maths", "PT", "Lunch", "Social Studies", "Computer", "Art", "Library", "Games", "none"],
    "rise": ["self", "r20", "r30", "r45"],
    "move": ["still", "light", "active"],
    "last": ["none"] + [str(c) for c in CODES],
}
USED = ["period", "rise", "move", "tod", "dow"]  # 'last' is stored but did not help
W = 16      # the school prior counts as 16 observations of this child (tuned on simulated children)
ALPHA = 1   # Laplace smoothing
PW = 0.5    # feature weight: softens Naive Bayes over-confidence with few examples


def new_model() -> dict:
    return {"n": 0, "f": {}, "x": {}}


def tod_of(hh: int, mm: int) -> str:
    m = hh * 60 + mm
    return "morning" if m < 630 else "mid" if m < 780 else "afternoon"


def rise_bucket(pct) -> str:
    return "self" if pct is None else "r45" if pct >= 45 else "r30" if pct >= 30 else "r20"


def clean_ctx(ctx: dict) -> dict:
    out = {}
    for k, vals in FEATURES.items():
        v = str(ctx.get(k, ""))
        out[k] = v if v in vals else ("none" if vals[-1] == "none" else vals[0])
    return out


def update(m: dict, ctx: dict, code: int) -> None:
    c = clean_ctx(ctx)
    code = str(code)
    m["n"] += 1
    m["f"][code] = m["f"].get(code, 0) + 1
    for k, v in c.items():
        d = m["x"].setdefault(k, {}).setdefault(v, {})
        d[code] = d.get(code, 0) + 1


def suggest(child: dict | None, school: dict | None, ctx: dict, codes: list[int] | None = None) -> list[dict]:
    """Probabilities for every feeling, best first."""
    codes = codes or CODES
    c = clean_ctx(ctx)
    F = len(codes)
    child = child or new_model()
    school = school or new_model()

    def ps(code):
        return (school["f"].get(str(code), 0) + ALPHA) / (school["n"] + ALPHA * F)

    scores = []
    for code in codes:
        sc = str(code)
        nf = child["f"].get(sc, 0)
        s = math.log((nf + W * ps(code) + 0.01) / (child["n"] + W + 0.01 * F))
        for k in USED:
            v = c[k]
            V = len(FEATURES[k])
            sch = (school["x"].get(k, {}).get(v, {}).get(sc, 0) + ALPHA) / (school["f"].get(sc, 0) + ALPHA * V)
            mine = child["x"].get(k, {}).get(v, {}).get(sc, 0)
            s += PW * math.log((mine + W * sch) / (nf + W))
        scores.append((code, s))
    top = max(s for _, s in scores)
    z = sum(math.exp(s - top) for _, s in scores)
    return sorted(({"code": code, "p": math.exp(s - top) / z} for code, s in scores), key=lambda x: -x["p"])


# ------------------------------------------------------------------ simulated children
def _rng(seed: int):
    a = seed & 0xFFFFFFFF

    def next_():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return next_


HABITS = [
    (lambda x: x["period"] == "Maths", 2, 0.55),
    (lambda x: x["period"] == "Science" and x["dow"] == "5", 6, 0.6),
    (lambda x: x["tod"] == "afternoon", 3, 0.35),
    (lambda x: x["period"] == "Lunch", 8, 0.5),
    (lambda x: x["move"] == "active" or x["period"] in ("PT", "Games"), 10, 0.75),
    (lambda x: x["dow"] == "1", 6, 0.4),
    (lambda x: x["period"] == "English" and x.get("rise") == "r45", 5, 0.5),
    (lambda x: x["tod"] == "mid" and x["period"] == "Hindi", 4, 0.4),
    (lambda x: x["period"] == "Art", 7, 0.35),
]
BASE = [(1, 0.5), (2, 0.1), (3, 0.08), (4, 0.06), (5, 0.04), (6, 0.08), (7, 0.03), (8, 0.05), (9, 0.03), (10, 0.03)]
SLOTS = [("08:30", "English"), ("09:10", "Hindi"), ("09:50", "Science"), ("10:45", "Maths"), ("11:30", "PT"),
         ("12:15", "Lunch"), ("12:55", "Social Studies"), ("13:35", "Computer"), ("14:15", "Art"), ("15:00", "Library")]
RISE = {1: [0.6, 0.3, 0.1], 2: [0.35, 0.45, 0.2], 3: [0.5, 0.35, 0.15], 4: [0.15, 0.4, 0.45], 5: [0.1, 0.35, 0.55],
        6: [0.3, 0.45, 0.25], 7: [0.45, 0.4, 0.15], 8: [0.5, 0.35, 0.15], 9: [0.3, 0.4, 0.3], 10: [0.05, 0.25, 0.7]}


def _pick(r, pairs):
    u, acc = r(), 0.0
    for v, p in pairs:
        acc += p
        if u < acc:
            return v
    return pairs[-1][0]


def simulate_child(seed: int, days: int = 30, habits=None) -> dict:
    r = _rng(seed)
    if habits is None:
        order = sorted(HABITS, key=lambda _: r() - 0.5)
        habits = order[: 2 + int(r() * 2)]
    events, last = [], "none"
    for d in range(days):
        dow = str(1 + (d % 6))
        for _ in range(1 + int(r() * 3)):
            hm, period = SLOTS[int(r() * len(SLOTS))]
            hh, mm = map(int, hm.split(":"))
            asked = r() < 0.75
            pe = period in ("PT", "Games")
            ctx = {"tod": tod_of(hh, mm), "dow": dow, "period": period, "last": last}
            code = None
            for when, c, p in habits:
                if when({**ctx, "move": "active" if pe else "still"}) and r() < p:
                    code = c
                    break
            if code is None:
                code = _pick(r, BASE)
            if code == 10 and not pe and r() < 0.6:
                code = 1
            ctx["rise"] = _pick(r, [(v, RISE[code][i]) for i, v in enumerate(["r20", "r30", "r45"])]) if asked else "self"
            ctx["move"] = ("active" if r() < 0.7 else "light") if code == 10 else ("light" if r() < 0.12 else "still")
            events.append({"day": d, "ctx": ctx, "code": code})
            last = str(code)
    return {"habits": habits, "events": events}


def evaluate(children: int = 60, days: int = 30, seed: int = 23, warmup: int = 8) -> dict:
    """Online evaluation over simulated children (seed 11 was used for tuning; 23 is held out):
    every choice is predicted BEFORE the model sees it, against 'most common feeling so far'."""
    kids = [simulate_child(seed * 1000 + i, days) for i in range(children)]
    school, models, glob = new_model(), [new_model() for _ in kids], {}
    n = top1 = top3 = b1 = b3 = nd = d3 = bd3 = 0
    hard = {2, 3, 4, 5, 6, 7, 8}
    for d in range(days):
        for i, kid in enumerate(kids):
            for ev in (e for e in kid["events"] if e["day"] == d):
                if models[i]["n"] >= warmup:
                    ranked = [x["code"] for x in suggest(models[i], school, ev["ctx"])]
                    common = sorted(CODES, key=lambda c: -glob.get(c, 0))
                    n += 1
                    top1 += ranked[0] == ev["code"]
                    top3 += ev["code"] in ranked[:3]
                    b1 += common[0] == ev["code"]
                    b3 += ev["code"] in common[:3]
                    if ev["code"] in hard:
                        nd += 1
                        d3 += ev["code"] in ranked[:3]
                        bd3 += ev["code"] in common[:3]
                update(models[i], ev["ctx"], ev["code"])
                update(school, ev["ctx"], ev["code"])
                glob[ev["code"]] = glob.get(ev["code"], 0) + 1

    def pct(x, of=None):
        return round(x / max(1, of if of is not None else n) * 1000) / 10
    return {"model": "Per-child Naive Bayes (Laplace smoothing, school-wide prior worth 16 observations, feature weight 0.5, online updates)",
            "features": USED, "children": children, "days": days, "events_scored": n, "warmup_choices": warmup,
            "top1": pct(top1), "top3": pct(top3), "baseline": "Most common feeling so far (whole school)",
            "baseline_top1": pct(b1), "baseline_top3": pct(b3), "difficult_scored": nd, "difficult_top3": pct(d3, nd),
            "baseline_difficult_top3": pct(bd3, nd),
            "data": "Simulated children with known habits (no real children). Real accuracy can only come from a pilot.",
            "school": school}
