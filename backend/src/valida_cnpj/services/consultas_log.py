"""Log de consultas CNPJ bem-sucedidas (JSON)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def ensure_data_dir(data_dir: Path) -> None:
    os.makedirs(data_dir, exist_ok=True)


def load_consultas_log(path: Path) -> list:
    if not path.is_file():
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except (OSError, ValueError, json.JSONDecodeError):
        return []


def append_consulta_log(path: Path, data_dir: Path, cnpj14: str) -> None:
    ensure_data_dir(data_dir)
    lst = load_consultas_log(path)
    lst.append({"at": datetime.now(timezone.utc).isoformat(), "cnpj": cnpj14})
    lst = lst[-5000:]
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(lst, fh, ensure_ascii=False)
    except OSError:
        pass
