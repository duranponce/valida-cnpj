"""Cliente HTTP ReceitaWS."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

import requests

from valida_cnpj.config import RECEITAWS_URL


def normalize_cnpj_digits(cnpj: str) -> Tuple[bool, str, Optional[str]]:
    digits = re.sub(r"\D", "", cnpj or "")
    if not digits or len(digits) > 14:
        return False, "", "CNPJ inválido."
    return True, digits.zfill(14)[-14:], None


def fetch_cnpj_json(cnpj14: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    url = RECEITAWS_URL + cnpj14
    try:
        r = requests.get(url, timeout=45)
        r.raise_for_status()
        return r.json(), None
    except ValueError:
        return None, "Resposta inválida da ReceitaWS."
    except requests.RequestException as exc:
        return None, str(exc)
