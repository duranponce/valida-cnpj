"""WSGI: `gunicorn -w 2 -b 0.0.0.0:5000 backend.wsgi:app` (a partir da raiz do repo)."""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "backend" / "src"))

from valida_cnpj import create_app  # noqa: E402

app = create_app()
