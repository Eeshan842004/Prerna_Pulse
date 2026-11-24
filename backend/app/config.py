"""Runtime settings, read from environment variables."""
import os
from dataclasses import dataclass


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # pp_app is subject to row-level security; the owner DSN is only used by `manage init`.
    app_dsn: str = os.environ.get("PP_APP_DSN", "postgresql://pp_app:pp_app@localhost:5432/prerana")
    owner_dsn: str = os.environ.get("PP_OWNER_DSN", "postgresql://postgres@localhost:5432/prerana")
    # 32-byte keys as hex. The defaults are for local demos only.
    master_key_hex: str = os.environ.get("PP_MASTER_KEY", "6b" * 32)
    secret_key_hex: str = os.environ.get("PP_SECRET_KEY", "5a" * 32)
    demo_mode: bool = _bool("PP_DEMO_MODE", True)
    timer_poll_seconds: float = float(os.environ.get("PP_TIMER_POLL_SECONDS", "2" if _bool("PP_DEMO_MODE", True) else "30"))
    outbox_poll_seconds: float = float(os.environ.get("PP_OUTBOX_POLL_SECONDS", "1"))
    gateway_stale_seconds: int = int(os.environ.get("PP_GATEWAY_STALE_SECONDS", "90"))
    replay_window: int = int(os.environ.get("PP_REPLAY_WINDOW", "32"))
    web_dir: str = os.environ.get("PP_WEB_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "web"))
    run_workers: bool = _bool("PP_RUN_WORKERS", True)

    @property
    def master_key(self) -> bytes:
        return bytes.fromhex(self.master_key_hex)

    @property
    def secret_key(self) -> bytes:
        return bytes.fromhex(self.secret_key_hex)


settings = Settings()
