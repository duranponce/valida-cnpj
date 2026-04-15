#!/usr/bin/env python3
"""Smoke: GET /api/health (sem servidor — usa test_client). Opcional: SMOKE_BASE=http://host:5000."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from valida_cnpj import create_app  # noqa: E402


def main() -> int:
    base = (os.environ.get("SMOKE_BASE") or "").strip().rstrip("/")
    if base:
        url = base + "/api/health"
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:  # noqa: S310
                body = resp.read().decode("utf-8", errors="replace")
                data = json.loads(body)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            print("FAIL", url, exc)
            return 1
    else:
        app = create_app()
        c = app.test_client()
        resp = c.get("/api/health")
        if resp.status_code != 200:
            print("FAIL /api/health", resp.status_code, resp.data[:500])
            return 1
        data = resp.get_json()
    if not isinstance(data, dict) or not data.get("ok"):
        print("FAIL unexpected JSON", data)
        return 1
    routes = data.get("routes") or {}
    if not routes.get("dashboard_stats"):
        print("FAIL missing route flag dashboard_stats", data)
        return 1
    print("OK /api/health", data.get("app"), data.get("package"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
