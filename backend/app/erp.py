"""ERP adapter: the only place that knows real names.

Prerana Pulse stores students by ERP reference, never by name. Screens ask this adapter for
names at display time. In production the adapter calls the PRASUNEX ERP (sign-in over OIDC,
rosters over REST); this prototype ships a mock that reads a sample roster file."""
from __future__ import annotations

import json
import os
from typing import Protocol


class ERPAdapter(Protocol):
    def name(self, erp_ref: str) -> str: ...
    def roster(self) -> list[dict]: ...


class MockERP:
    def __init__(self, path: str | None = None):
        path = path or os.path.join(os.path.dirname(__file__), "..", "data", "mock_erp_roster.json")
        with open(path, encoding="utf-8") as f:
            self._rows = json.load(f)
        self._by_ref = {r["erp_ref"]: r for r in self._rows}

    def name(self, erp_ref: str) -> str:
        row = self._by_ref.get(erp_ref)
        return row["name"] if row else "Unknown"

    def roster(self) -> list[dict]:
        return list(self._rows)


class PrasunexERP:  # pragma: no cover - needs PRASUNEX API access
    """Placeholder for the real integration: OIDC sign-in plus a roster endpoint."""

    def __init__(self, base_url: str, client_id: str, client_secret: str):
        raise NotImplementedError("PRASUNEX API access is needed; the prototype uses MockERP")


erp: ERPAdapter = MockERP()
