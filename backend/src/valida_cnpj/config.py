"""Paths e variáveis de ambiente (repo root = acima de backend/)."""
from __future__ import annotations

import os
from pathlib import Path

# valida_cnpj/config.py -> valida_cnpj, src, backend, repo
_PKG = Path(__file__).resolve().parent
REPO_ROOT = _PKG.parent.parent.parent

FRONTEND_PUBLIC = REPO_ROOT / "frontend" / "public"
FRONTEND_CSS = REPO_ROOT / "frontend" / "css"
FRONTEND_JS = REPO_ROOT / "frontend" / "js"


def _env_path(name: str, default: Path) -> Path:
    v = os.environ.get(name)
    return Path(v).expanduser() if v else default


EXPORTADOS_DIR = _env_path("EXPORTADOS_DIR", REPO_ROOT / "exportados")
ARQUIVADOS_DIR = _env_path("ARQUIVADOS_DIR", REPO_ROOT / "arquivados")
DATA_DIR = _env_path("DATA_DIR", REPO_ROOT / "data")
CONSULTAS_LOG_PATH = DATA_DIR / "consultas_log.json"
DB_PATH = DATA_DIR / "valida_cnpj.db"

APP_USER = os.environ.get("VALIDA_CNPJ_USER", "valida.admin")
APP_PASS = os.environ.get("VALIDA_CNPJ_PASS", "CNPJ-2026-Seguro!")

# Fase 2 (opcional): prefixo único no Flask; hoje vazio — meta application-root no front deve ficar alinhada.
APPLICATION_ROOT = os.environ.get("APPLICATION_ROOT", "").strip().rstrip("/")

RECEITAWS_URL = "https://www.receitaws.com.br/v1/cnpj/"
