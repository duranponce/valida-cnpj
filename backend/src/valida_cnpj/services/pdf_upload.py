"""Upload multipart de PDF para pasta arquivados/."""
from __future__ import annotations

import os
from typing import Optional

from flask import jsonify
from werkzeug.datastructures import FileStorage

from valida_cnpj.services.storage import fallback_pdf_name, safe_storage_name


def save_pdf_arquivados_response(arquivados_dir: str, f: Optional[FileStorage]):
    if not f:
        return jsonify({"error": "Campo file ausente."}), 400
    raw_name = (f.filename or "").strip() or "consulta.pdf"
    safe = safe_storage_name(raw_name)
    if not safe:
        safe = fallback_pdf_name()
    os.makedirs(arquivados_dir, exist_ok=True)
    path = os.path.join(arquivados_dir, safe)
    try:
        f.save(path)
    except OSError as exc:
        return jsonify({"error": "Não foi possível gravar o arquivo: {}".format(exc)}), 500
    return jsonify({"ok": True, "name": safe})
