"""Start the API:  python -m app.serve [--port 8000]

Same as `uvicorn app.main:app`, but picks the event loop psycopg needs on Windows before the
server starts (uvicorn would otherwise create the default Windows loop first)."""
from __future__ import annotations

import argparse
import asyncio
import sys

import uvicorn

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    uvicorn.run("app.main:app", host=args.host, port=args.port, loop="none" if sys.platform == "win32" else "auto")  # "none": use the policy set above


if __name__ == "__main__":
    main()
