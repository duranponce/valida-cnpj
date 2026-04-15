#!/usr/bin/env python3
"""Ponto de entrada na raiz do repositório (compatível com `python app.py`)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from valida_cnpj import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    print("Abra http://127.0.0.1:5000 no navegador (Ctrl+C para encerrar).")
    print("Pastas: exportados/ e arquivados/ (PDFs).")
    print(
        "Rotas API arquivados:",
        [r.rule for r in app.url_map.iter_rules() if "arquivados" in r.rule or "salvar_arquivado" in r.rule],
    )
    app.run(host="0.0.0.0", port=5000, debug=False)
