#!/usr/bin/env python3
"""Prerana Pulse gateway: hears band messages and forwards them to the server over HTTPS.

The same program runs on an ESP32 hub's companion PC, a smartboard or lab PC, or (later) a
tablet. It only makes outbound HTTPS calls on port 443, which school firewalls allow.

Modes
  --sim   (default) A local HTTP endpoint stands in for the radio. The virtual band in the web
          app "broadcasts" by POSTing its 19 bytes to /air, and gets the receipt back, exactly as
          a real band would hear it.
  --ble   Real Bluetooth via the `bleak` library: scans for band advertisements, forwards them,
          then writes the receipt back over a short GATT connection. Written but not yet tested
          on hardware, because the team has no bands yet.

What it guarantees
  * Never invents a receipt: it only relays the server's signed one. If the server can't be
    reached, the band gets nothing and buzzes twice ("not sent, tell an adult").
  * Queues up to 500 messages on disk when the internet drops and sends them, in order, when
    it comes back. The server keeps one copy even if several gateways forward the same message.
  * Sends a heartbeat every 30 seconds, so the school sees a dead gateway on its dashboard.

No third-party packages are needed in --sim mode.
"""
from __future__ import annotations

import argparse
import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "0.4.0"
QUEUE_MAX = 500


class Gateway:
    def __init__(self, server: str, gateway_id: str, token: str, queue_file: str):
        self.server = server.rstrip("/")
        self.id = gateway_id
        self.token = token
        self.queue_file = queue_file
        self.queue: deque[dict] = deque(maxlen=QUEUE_MAX)  # {'hex': ..., 'rssi': ...}
        self.paused = False          # demo switch: simulate a power cut
        self.forwarded = 0
        self.last_error: str | None = None
        self.lock = threading.Lock()
        self._load_queue()

    # ---------------------------------------------------------------- server calls
    def _post(self, path: str, body: dict, timeout: float = 4.0) -> dict:
        req = urllib.request.Request(
            self.server + path, data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "X-Gateway-Id": self.id,
                     "Authorization": f"Bearer {self.token}"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())

    def forward(self, packet_hex: str, rssi: int | None = None) -> dict:
        """Forward one message with the signal strength (RSSI) it was heard at: the server uses it to
        place the child during an SOS. Returns the server's result, including the signed receipt."""
        if self.paused:
            return {"status": "gateway_off"}
        item = {"hex": packet_hex, "rssi": rssi}
        try:
            with self.lock:
                self._flush_queue()
                result = self._post("/api/gw/ingest", {"packets": [item]})["results"][0]
            self.forwarded += 1
            self.last_error = None
            return result
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            self.last_error = str(e)
            with self.lock:
                self.queue.append(item)
                self._save_queue()
            return {"status": "queued", "reason": "server unreachable; will send when back online"}

    def heartbeat(self) -> None:
        if self.paused:
            return
        try:
            with self.lock:
                self._flush_queue()
            self._post("/api/gw/heartbeat", {"version": VERSION, "queued": len(self.queue)})
            self.last_error = None
        except Exception as e:  # noqa: BLE001 - keep beating
            self.last_error = str(e)

    def beacon(self) -> dict:
        """Server time for band clock sync (the band needs the 15-minute epoch)."""
        with urllib.request.urlopen(self.server + "/api/gw/time", timeout=4) as resp:
            return json.loads(resp.read())

    # ---------------------------------------------------------------- offline queue
    def _flush_queue(self) -> None:
        while self.queue:
            batch = list(self.queue)[:32]
            self._post("/api/gw/ingest", {"packets": batch})
            for _ in batch:
                self.queue.popleft()
            self._save_queue()

    def _load_queue(self) -> None:
        if os.path.exists(self.queue_file):
            with open(self.queue_file, encoding="utf-8") as f:
                self.queue.extend(x if isinstance(x, dict) else {"hex": x, "rssi": None} for x in json.load(f))

    def _save_queue(self) -> None:
        tmp = self.queue_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(list(self.queue), f)
        os.replace(tmp, self.queue_file)

    def status(self) -> dict:
        return {"id": self.id, "version": VERSION, "paused": self.paused, "queued": len(self.queue),
                "forwarded": self.forwarded, "last_error": self.last_error, "server": self.server}


# -------------------------------------------------------------------- simulated radio
def make_handler(gw: Gateway):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):  # quieter console
            pass

        def _send(self, code: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self._send(204, {})

        def do_GET(self):
            if self.path == "/beacon":
                try:
                    self._send(200, gw.beacon())
                except Exception as e:  # noqa: BLE001
                    self._send(503, {"error": str(e)})
            elif self.path == "/status":
                self._send(200, gw.status())
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/air":
                result = gw.forward(body.get("packet", ""), body.get("rssi"))
                self._send(200, {"gateway": gw.id, **result})
            elif self.path == "/power":
                gw.paused = not bool(body.get("on", True))
                self._send(200, gw.status())
            else:
                self._send(404, {"error": "not found"})
    return Handler


# -------------------------------------------------------------------- real Bluetooth (untested)
def run_ble(gw: Gateway) -> None:  # pragma: no cover - needs a band
    """Scan for band advertisements and forward them. Requires `pip install bleak`.

    Band advertisements carry manufacturer data under company ID 0xFFFF (the Bluetooth SIG's
    test ID; a real product registers its own): the 19-byte message. The receipt goes back over a
    short GATT write to the band's receipt characteristic.
    """
    import asyncio
    from bleak import BleakClient, BleakScanner

    company_id = 0xFFFF
    receipt_char = "7f1c0002-5a1e-4f7b-9e3a-70726572616e"
    seen: dict[str, float] = {}

    async def deliver_receipt(address: str, receipt_hex: str) -> None:
        async with BleakClient(address, timeout=3.0) as client:
            await client.write_gatt_char(receipt_char, bytes.fromhex(receipt_hex), response=True)

    async def main() -> None:
        def on_adv(device, adv):
            data = adv.manufacturer_data.get(company_id)
            if not data or len(data) != 19:
                return
            hx = data.hex()
            if seen.get(hx, 0) > time.time() - 5:
                return  # the band repeats each message several times
            seen[hx] = time.time()
            result = gw.forward(hx, getattr(adv, "rssi", None))
            if result.get("receipt"):
                asyncio.ensure_future(deliver_receipt(device.address, result["receipt"]))

        async with BleakScanner(on_adv):
            while True:
                await asyncio.sleep(1)

    asyncio.run(main())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server", default=os.environ.get("PP_SERVER", "http://localhost:8000"))
    ap.add_argument("--id", default=os.environ.get("PP_GATEWAY_ID", "gw-7b"))
    ap.add_argument("--token", default=os.environ.get("PP_GATEWAY_TOKEN", "demo-token-gw-7b"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PP_GATEWAY_PORT", "8081")))
    ap.add_argument("--heartbeat", type=float, default=float(os.environ.get("PP_HEARTBEAT_SECONDS", "30")))
    ap.add_argument("--ble", action="store_true", help="use real Bluetooth (needs bleak; untested)")
    args = ap.parse_args()

    gw = Gateway(args.server, args.id, args.token, queue_file=f".queue-{args.id}.json")

    def beat():
        while True:
            gw.heartbeat()
            time.sleep(args.heartbeat)
    threading.Thread(target=beat, daemon=True).start()

    if args.ble:
        run_ble(gw)
        return
    print(f"[{gw.id}] simulated radio on http://localhost:{args.port}  ->  {gw.server}")
    ThreadingHTTPServer(("0.0.0.0", args.port), make_handler(gw)).serve_forever()


if __name__ == "__main__":
    main()
