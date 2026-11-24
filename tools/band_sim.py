#!/usr/bin/env python3
"""Command-line virtual band: sends real 19-byte band messages to one or more gateways.

    python tools/band_sim.py --band 1001 talk                 # Talk to someone: my adult (arg 1 = counsellor)
    python tools/band_sim.py --band 1001 feeling 3            # chose "Sad" (codes 1 fine .. 10 just active)
    python tools/band_sim.py --band 1001 sos --near gw-stairs # SOS from near the Block A stairs
    python tools/band_sim.py --band 1001 pause 30             # PT mode for 30 minutes
    python tools/band_sim.py --band 1001 talk --gateways http://localhost:8081,http://localhost:8082

Uses the demo key for the band (see backend/app/seed.py). It checks the receipt exactly as the
firmware does: one buzz only if the server's signature on the receipt is valid.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app import protocol  # noqa: E402
from app.content import rssi_from  # noqa: E402
from app.seed import demo_band_key  # noqa: E402

TYPES = {"feeling": protocol.T_FEELING, "skipped": protocol.T_SKIPPED, "talk": protocol.T_TALK, "sos": protocol.T_SOS,
         "cancel": protocol.T_CANCEL, "status": protocol.T_STATUS, "battery": protocol.T_BATTERY, "pause": protocol.T_PAUSE,
         "seen": protocol.T_SEEN, "exercise": protocol.T_EXERCISE}


GATEWAY_BY_PORT = {str(8081 + i): g for i, g in enumerate(["gw-7b", "gw-stairs", "gw-library", "gw-lab", "gw-playground", "gw-office"])}


def http(method: str, url: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--band", type=int, default=1001)
    ap.add_argument("--gateways", default="http://localhost:8081")
    ap.add_argument("--near", default="gw-7b", help="which gateway place the band is standing near (sets the signal strengths)")
    ap.add_argument("--counter", type=int, help="override the counter (to test replay protection)")
    ap.add_argument("--state", default=".band-counters.json")
    ap.add_argument("type", choices=TYPES)
    ap.add_argument("arg", nargs="?", type=int, default=0)
    a = ap.parse_args()

    state = json.load(open(a.state)) if os.path.exists(a.state) else {}
    counter = a.counter or state.get(str(a.band), 100) + 1
    state[str(a.band)] = max(counter, state.get(str(a.band), 0))
    json.dump(state, open(a.state, "w"))

    gateways = a.gateways.split(",")
    epoch = http("GET", gateways[0] + "/beacon")["epoch"]
    key = demo_band_key(a.band)
    packet = protocol.build_packet(key, counter, epoch, TYPES[a.type], a.arg)
    rid = protocol.rotating_id(key, epoch)
    print(f"band {a.band}  counter {counter}  epoch {epoch}  packet {packet.hex()} ({len(packet)} bytes)")

    buzz = False
    for g in gateways:  # a broadcast is heard by every gateway in range
        gw_id = GATEWAY_BY_PORT.get(g.rsplit(":", 1)[-1], a.near)
        res = http("POST", g + "/air", {"packet": packet.hex(), "rssi": rssi_from(a.near, gw_id)})
        status = None
        if res.get("receipt"):
            status = protocol.verify_receipt(key, bytes.fromhex(res["receipt"]), rid, counter)
        print(f"  {res.get('gateway', g)}: {res.get('status')}  receipt valid: {status is not None}"
              + (f"  ({res.get('reason')})" if res.get("reason") else ""))
        buzz = buzz or status is not None
    print("  band: ONE buzz (the school has it)" if buzz else "  band: TWO buzzes (not sent - tell an adult)")


if __name__ == "__main__":
    main()
