from __future__ import annotations

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SETTINGS_PATH = DATA_DIR / "agent_settings.json"

DEFAULT_HOSTINGER_WEBHOOK = (
    "https://midnightblue-mosquito-424375.hostingersite.com/api/kommo/simulator"
)
LOCAL_WEBHOOK = "http://localhost:3000/api/kommo/simulator"

PRESETS = {
    "hostinger": DEFAULT_HOSTINGER_WEBHOOK,
    "local": LOCAL_WEBHOOK,
}


def _read() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _write(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def save_webhook_url(url: str) -> str:
    url = url.strip()
    data = _read()
    data["agent_webhook_url"] = url
    _write(data)
    return url


def ensure_default_settings() -> str:
    """Primera vez o config vieja en localhost → Hostinger (tiene OPEN_AI)."""
    data = _read()
    url = data.get("agent_webhook_url", "").strip()
    if not url:
        return save_webhook_url(DEFAULT_HOSTINGER_WEBHOOK)
    if url.rstrip("/") == LOCAL_WEBHOOK.rstrip("/"):
        return save_webhook_url(DEFAULT_HOSTINGER_WEBHOOK)
    return url


def get_webhook_url() -> str:
    ensure_default_settings()
    saved = _read().get("agent_webhook_url", "").strip()
    if saved:
        return saved
    env_url = os.getenv("AGENT_WEBHOOK_URL", "").strip()
    if env_url and env_url.rstrip("/") != LOCAL_WEBHOOK.rstrip("/"):
        return env_url
    return DEFAULT_HOSTINGER_WEBHOOK


def get_settings() -> dict:
    url = get_webhook_url()
    preset = "custom"
    for name, preset_url in PRESETS.items():
        if url.rstrip("/") == preset_url.rstrip("/"):
            preset = name
            break
    return {
        "agent_webhook_url": url,
        "preset": preset,
        "presets": PRESETS,
    }
