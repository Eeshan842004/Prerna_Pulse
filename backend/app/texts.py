"""Notification texts. Every alert stores a kind and its variables, so the apps can show it in
English or Hindi; the English title and body made here are the fallback (and what SMS would send)."""
from __future__ import annotations

from .content import GW


def _place(gw) -> str:
    return GW[gw][2] if gw in GW else "unknown"


def make(kind: str, v: dict) -> tuple[str, str]:
    if kind == "talk_new":
        return f"{v['first']} wants to talk", f"{v['who']} asked on the band to talk to you. Respond by {v['due']}."
    if kind == "talk_moved_you":
        return "Moved to you", f"{v['who']}: no one responded in time. Respond by {v['due']}."
    if kind == "talk_moved_on":
        return "Moved on", f"{v['who']}: the deadline passed, so it moved to {v['to']}."
    if kind == "talk_handover":
        return "Handed to you", f"{v['who']}: {v['by']} asked you to take this. Respond by {v['due']}."
    if kind == "remind":
        return f"Reminder: {v['pct']}% of the time used", f"{v['who']}. Respond by {v['due']}."
    if kind == "unanswered":
        return "Unanswered at every level", f"{v['who']}: nobody responded at any level."
    if kind == "sos":
        return ("Medical SOS" if v.get("medical") else "SOS",
                f"{v['who']} {'is unwell and needs the nurse' if v.get('medical') else 'needs help now'}. Near {_place(v.get('gw'))}.")
    if kind == "sos_going":
        return "Someone is going", f"{v['by']} is going to {v['who']}."
    if kind == "sos_sms":
        return "SOS not answered: SMS", f"{v['who']} still needs help. Near {_place(v.get('gw'))}."
    if kind == "sos_call":
        return "Call now", f"SOS not answered: {v['who']}."
    if kind == "sos_cancel":
        return "SOS cancelled by the child", f"{v['who']} cancelled. A quiet check-in later is a good idea."
    if kind == "sos_reached":
        return "Reached the child", f"{v['by']} reached {v['who']}."
    if kind == "pattern":
        from .content import FEELINGS
        return "Feelings pattern", f"{v['who']} has chosen \"{FEELINGS[v['code']][1]}\" on {v['n']} of the last 10 school days. Consider a check-in."
    if kind == "quiet":
        return "Quiet band", f"{v['who']} skipped the band's last 3 questions. Maybe say hi."
    if kind == "silent":
        return "Band silent", f"Band {v['band']} ({v['who']}) was silent all day. Check the battery or the fit."
    raise KeyError(kind)
