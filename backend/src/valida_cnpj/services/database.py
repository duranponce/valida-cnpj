"""Banco SQLite para entidades consultadas (sqlite3 nativo — sem dependências externas)."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Conexão
# ---------------------------------------------------------------------------

def _conn(db_path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


# ---------------------------------------------------------------------------
# Inicialização
# ---------------------------------------------------------------------------

def init_db(db_path: Path) -> None:
    """Cria tabelas e índices se não existirem."""
    with _conn(db_path) as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS entidades (
                cnpj           TEXT PRIMARY KEY,
                razao_social   TEXT NOT NULL DEFAULT '',
                fantasia       TEXT NOT NULL DEFAULT '',
                situacao       TEXT NOT NULL DEFAULT '',
                cep            TEXT NOT NULL DEFAULT '',
                municipio      TEXT NOT NULL DEFAULT '',
                uf             TEXT NOT NULL DEFAULT '',
                data_abertura  TEXT NOT NULL DEFAULT '',
                dados_json     TEXT,
                pinned         INTEGER NOT NULL DEFAULT 0,
                consultado_em  TEXT NOT NULL,
                atualizado_em  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entidades_pinned
                ON entidades(pinned);
            CREATE INDEX IF NOT EXISTS idx_entidades_razao
                ON entidades(razao_social COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_entidades_atualizado
                ON entidades(atualizado_em DESC);
        """)


# ---------------------------------------------------------------------------
# Escrita
# ---------------------------------------------------------------------------

def upsert_entidade(db_path: Path, cnpj14: str, data: Dict[str, Any]) -> None:
    """Insere ou atualiza entidade preservando o flag `pinned` existente."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn(db_path) as con:
        con.execute(
            """
            INSERT INTO entidades
                (cnpj, razao_social, fantasia, situacao, cep, municipio, uf,
                 data_abertura, dados_json, pinned, consultado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(cnpj) DO UPDATE SET
                razao_social  = excluded.razao_social,
                fantasia      = excluded.fantasia,
                situacao      = excluded.situacao,
                cep           = excluded.cep,
                municipio     = excluded.municipio,
                uf            = excluded.uf,
                data_abertura = excluded.data_abertura,
                dados_json    = excluded.dados_json,
                atualizado_em = excluded.atualizado_em
            """,
            (
                cnpj14,
                (data.get("nome") or "").strip(),
                (data.get("fantasia") or "").strip(),
                (data.get("situacao") or "").strip(),
                (data.get("cep") or "").strip(),
                (data.get("municipio") or "").strip(),
                (data.get("uf") or "").strip(),
                (data.get("abertura") or "").strip(),
                json.dumps(data, ensure_ascii=False),
                now,
                now,
            ),
        )


def pin_entidade(db_path: Path, cnpj14: str, pinned: bool) -> bool:
    """Fixa ou desfixa a entidade. Retorna True se encontrou o registro."""
    with _conn(db_path) as con:
        cur = con.execute(
            "UPDATE entidades SET pinned = ? WHERE cnpj = ?",
            (1 if pinned else 0, cnpj14),
        )
        return cur.rowcount > 0


def patch_entidade(db_path: Path, cnpj14: str, patch: Dict[str, Any]) -> bool:
    """
    Atualiza campos editáveis da entidade (colunas + merge em dados_json).
    Chaves em `patch` ausentes preservam o valor atual da coluna correspondente.
    """
    row = get_entidade(db_path, cnpj14)
    if row is None:
        return False

    dj_raw = row.get("dados_json") or ""
    try:
        j = json.loads(dj_raw) if isinstance(dj_raw, str) else dict(dj_raw or {})
    except (json.JSONDecodeError, TypeError):
        j = {}

    def pick(key: str, col_key: str | None = None) -> str:
        ck = col_key or key
        if key in patch:
            v = patch[key]
            return "" if v is None else str(v).strip()
        return str(row.get(ck) or "").strip()

    razao_social = pick("razao_social")
    fantasia = pick("fantasia")
    situacao = pick("situacao")
    cep = pick("cep")
    municipio = pick("municipio")
    uf = pick("uf")
    data_abertura = pick("data_abertura")

    j["nome"] = razao_social
    j["fantasia"] = fantasia
    j["situacao"] = situacao
    j["cep"] = cep
    j["municipio"] = municipio
    j["uf"] = uf
    j["abertura"] = data_abertura

    for opt in ("telefone", "email", "logradouro", "numero", "complemento", "bairro"):
        if opt in patch:
            v = patch[opt]
            j[opt] = "" if v is None else str(v).strip()

    now = datetime.now(timezone.utc).isoformat()
    with _conn(db_path) as con:
        con.execute(
            """
            UPDATE entidades SET
                razao_social = ?,
                fantasia = ?,
                situacao = ?,
                cep = ?,
                municipio = ?,
                uf = ?,
                data_abertura = ?,
                dados_json = ?,
                atualizado_em = ?
            WHERE cnpj = ?
            """,
            (
                razao_social,
                fantasia,
                situacao,
                cep,
                municipio,
                uf,
                data_abertura,
                json.dumps(j, ensure_ascii=False),
                now,
                cnpj14,
            ),
        )
    return True


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------

def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    # Garante que dados_json é retornado como string (não decodificado),
    # pois o front-end cuida da exibição.
    return d


def list_pinned(db_path: Path) -> List[Dict[str, Any]]:
    """Retorna entidades fixadas, ordenadas pela atualização mais recente."""
    with _conn(db_path) as con:
        rows = con.execute(
            "SELECT * FROM entidades WHERE pinned = 1 ORDER BY atualizado_em DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_all(db_path: Path) -> List[Dict[str, Any]]:
    """Retorna todas as entidades, ordenadas pela atualização mais recente."""
    with _conn(db_path) as con:
        rows = con.execute(
            "SELECT * FROM entidades ORDER BY atualizado_em DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_entidade(db_path: Path, cnpj14: str) -> Optional[Dict[str, Any]]:
    """Retorna uma entidade pelo CNPJ ou None se não encontrada."""
    with _conn(db_path) as con:
        row = con.execute(
            "SELECT * FROM entidades WHERE cnpj = ?", (cnpj14,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def search_autocomplete(
    db_path: Path, query: str, limit: int = 8
) -> List[Dict[str, Any]]:
    """Busca por CNPJ, razão social ou nome fantasia para autocomplete."""
    q = f"%{query}%"
    with _conn(db_path) as con:
        rows = con.execute(
            """
            SELECT cnpj, razao_social, fantasia, situacao, pinned
            FROM entidades
            WHERE cnpj LIKE ?
               OR razao_social LIKE ? COLLATE NOCASE
               OR fantasia     LIKE ? COLLATE NOCASE
            ORDER BY pinned DESC, atualizado_em DESC
            LIMIT ?
            """,
            (q, q, q, limit),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]
