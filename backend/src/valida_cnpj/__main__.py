"""Executar: PYTHONPATH=backend/src python -m valida_cnpj (ou via Docker)."""
from valida_cnpj import create_app

if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000, debug=False)
