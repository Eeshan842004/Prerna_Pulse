"""Shared school content: feelings, the timetable, gateway places on the school map, and the
signal-strength model used for SOS location. Mirrors web/js/content.js (demo data)."""
from __future__ import annotations

import json
import math
import os

# code -> (key, english, hindi, difficult)
FEELINGS = {
    1: ("fine", "I'm fine", "मैं ठीक हूँ", False),
    2: ("worried", "Worried", "चिंतित", True),
    3: ("sad", "Sad", "उदास", True),
    4: ("angry", "Angry", "गुस्सा", True),
    5: ("scared", "Scared", "डर लग रहा है", True),
    6: ("stressed", "Stressed", "तनाव", True),
    7: ("jealous", "Jealous", "जलन", True),
    8: ("left_out", "Left out", "अकेला / अलग-थलग", True),
    9: ("unwell", "Unwell", "तबीयत ठीक नहीं", False),
    10: ("just_active", "Just active / PT", "अभी दौड़ा / पीटी", False),
}
DIFFICULT = {c for c, f in FEELINGS.items() if f[3]}
KEY_TO_CODE = {f[0]: c for c, f in FEELINGS.items()}

PAUSING = {"PT", "Games", "Yoga", "Dance"}
_DAY_PLAN = [("08:00", "08:20", "Assembly"), ("08:20", "09:00", "English"), ("09:00", "09:40", "Hindi"), ("09:40", "10:20", "Science"),
             ("10:20", "11:20", "Maths"), ("11:20", "12:00", "PT"), ("12:00", "12:40", "Lunch"), ("12:40", "13:20", "Social Studies"),
             ("13:20", "14:00", "Computer"), ("14:00", "14:40", "Art"), ("14:40", "15:30", "Library")]


def timetable_for(class_name: str) -> list[dict]:
    plan = [list(p) for p in _DAY_PLAN]
    if class_name != "7B":  # other classes have PT at a different time
        i = 1 + (sum(map(ord, class_name)) % 4)
        plan[i][2], plan[5][2] = plan[5][2], plan[i][2]
    return [{"start": a, "end": b, "subject": s, "pauses": s in PAUSING} for a, b, s in plan]


# id, kind, name, x, y on a 400 x 260 school map
GATEWAYS = [
    ("gw-7b", "esp32-hub", "Classroom 7B corridor", 78, 62),
    ("gw-stairs", "esp32-hub", "Block A stairs", 168, 62),
    ("gw-library", "school-pc", "Library corridor", 262, 62),
    ("gw-lab", "school-pc", "Computer lab", 338, 140),
    ("gw-playground", "esp32-hub", "Playground gate", 118, 210),
    ("gw-office", "office-root", "School office (UPS + 4G)", 300, 216),
    ("gw-blockb", "esp32-hub", "Block B corridor", 30, 150),
]
GW = {g[0]: g for g in GATEWAYS}
IN_RANGE = -86


def rssi_from(near: str, gateway: str) -> int:
    """Signal strength a band standing at gateway `near` gives gateway `gateway` (simple path loss)."""
    a, b = GW.get(near), GW.get(gateway)
    if not a or not b:
        return -120
    return round(-42 - math.hypot(a[3] - b[3], a[4] - b[4]) * 0.24)


with open(os.path.join(os.path.dirname(__file__), "..", "data", "activities.json"), encoding="utf-8") as _f:
    ACTIVITIES = json.load(_f)["class_tension"]
for _i, _a in enumerate(ACTIVITIES):
    _a.setdefault("code", ["two_kind", "weather", "circle"][_i] if _i < 3 else f"a{_i}")
ACTIVITY_FOR = {"left_out": "Circle of change", "jealous": "Circle of change", "angry": "Two kind things", "sad": "Two kind things",
                "worried": "Weather report", "stressed": "Weather report", "scared": "Weather report"}

WHEN = {"now": "now", "break": "at the next break", "lunch": "at lunch", "after": "after school"}
WHERE = {"counselling": "Counselling room", "staff": "Staff room", "room12": "Room 12"}
