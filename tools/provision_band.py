"""Hand out a band: make a random key, register it for a student, and flash it over USB.

STATUS: written for the real band; not tested on hardware (none was available for Round 3).

    python tools/provision_band.py --band 2001 --student S7B05 --port /dev/ttyACM0
    python tools/provision_band.py --band 2001 --student S7B05            # just prints the line

The key is generated here, stored on the server and written to the band once. It is never
shown on screen unless no serial port is given.
"""
import argparse
import os
import secrets
import time

import psycopg

EPOCH_SECONDS = 900


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--band", type=int, required=True)
    ap.add_argument("--student", required=True, help="ERP reference of the student, e.g. S7B05")
    ap.add_argument("--port", help="serial port of the band, e.g. /dev/ttyACM0 or COM5")
    ap.add_argument("--dsn", default=os.environ.get("PP_OWNER_DSN", "postgresql://postgres@localhost:5432/prerana"))
    a = ap.parse_args()

    key = secrets.token_bytes(16)
    with psycopg.connect(a.dsn) as conn:
        conn.execute("SELECT set_config('app.role', 'system', false)")
        row = conn.execute("SELECT id, school_id, age_pack FROM users WHERE erp_ref = %s AND role = 'student'", (a.student,)).fetchone()
        if not row:
            raise SystemExit(f"no student {a.student}")
        conn.execute("INSERT INTO bands (id, school_id, student_id, key) VALUES (%s, %s, %s, %s) "
                     "ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, student_id = EXCLUDED.student_id, "
                     "last_counter = 0, revoked = false", (a.band, row[1], row[0], key))
    junior = " JUNIOR" if row[2] == "junior" else ""   # classes 3 to 5 get the 6-item menu
    line = f"KEY {key.hex()} EPOCH {int(time.time() // EPOCH_SECONDS)}{junior}\n"

    if not a.port:
        print(line, end="")
        return
    import serial  # pip install pyserial
    with serial.Serial(a.port, 115200, timeout=5) as s:
        deadline = time.time() + 20
        while time.time() < deadline:
            if b"READY" in s.readline():
                s.write(line.encode())
                if b"OK" in s.readline():
                    print(f"band {a.band} provisioned for {a.student}")
                    return
        raise SystemExit("the band did not answer; is it on first boot?")


if __name__ == "__main__":
    main()
