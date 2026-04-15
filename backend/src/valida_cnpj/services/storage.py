"""PDFs em exportados/ e arquivados/."""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Optional

from werkzeug.utils import secure_filename


def safe_storage_name(name: str) -> Optional[str]:
    base = os.path.basename(name or "")
    base = secure_filename(base)
    if not base or base.startswith("."):
        return None
    if not base.lower().endswith(".pdf"):
        return None
    return base


def list_pdf_files(directory: str) -> list[dict]:
    out: list[dict] = []
    if not os.path.isdir(directory):
        return out
    for fn in sorted(os.listdir(directory), reverse=True):
        path = os.path.join(directory, fn)
        if not os.path.isfile(path) or not fn.lower().endswith(".pdf"):
            continue
        stat = os.stat(path)
        out.append(
            {
                "name": fn,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            }
        )
    return out


def fallback_pdf_name() -> str:
    return "CNPJ_{}_{}.pdf".format(
        datetime.now().strftime("%Y%m%d_%H%M%S"),
        uuid.uuid4().hex[:8],
    )
