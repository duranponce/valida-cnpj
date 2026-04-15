"""Serviço de enriquecimento em lote — atualiza entidades via ReceitaWS."""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# Job de enriquecimento
# ---------------------------------------------------------------------------

class EnriquecimentoJob:
    """
    Fila em memória para atualização em lote de entidades fixadas.
    Uma instância global por processo Flask.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._total: int = 0
        self._processados: int = 0
        self._erros: List[Dict[str, Any]] = []
        self._em_andamento: bool = False
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------
    # Propriedades de status (thread-safe)
    # ------------------------------------------------------------------

    @property
    def status(self) -> Dict[str, Any]:
        with self._lock:
            pct = (self._processados / self._total * 100) if self._total else 0
            return {
                "em_andamento": self._em_andamento,
                "total": self._total,
                "processados": self._processados,
                "percentual": round(pct, 1),
                "erros": list(self._erros),
                "concluido": not self._em_andamento and self._total > 0,
            }

    # ------------------------------------------------------------------
    # Iniciar
    # ------------------------------------------------------------------

    def iniciar(
        self,
        cnpj_list: List[str],
        db_path: Path,
        delay: float = 1.5,
    ) -> bool:
        """
        Inicia o job se não houver outro em andamento.
        Retorna True se iniciou com sucesso, False se já estava rodando.
        """
        with self._lock:
            if self._em_andamento:
                return False
            self._total = len(cnpj_list)
            self._processados = 0
            self._erros = []
            self._em_andamento = True

        self._thread = threading.Thread(
            target=self._run,
            args=(cnpj_list, db_path, delay),
            daemon=True,
            name="enriquecimento-job",
        )
        self._thread.start()
        return True

    # ------------------------------------------------------------------
    # Worker (thread separada)
    # ------------------------------------------------------------------

    def _run(self, cnpj_list: List[str], db_path: Path, delay: float) -> None:
        # Importações locais para evitar circular import no nível de módulo
        from valida_cnpj.services.database import upsert_entidade
        from valida_cnpj.services.receitaws import fetch_cnpj_json

        for cnpj in cnpj_list:
            try:
                data, err = fetch_cnpj_json(cnpj)
                if err or not data:
                    with self._lock:
                        self._erros.append(
                            {"cnpj": cnpj, "erro": err or "Resposta vazia"}
                        )
                elif isinstance(data, dict) and data.get("status") != "ERROR":
                    upsert_entidade(db_path, cnpj, data)
                else:
                    msg = data.get("message", "CNPJ com erro na ReceitaWS") if data else "Sem dados"
                    with self._lock:
                        self._erros.append({"cnpj": cnpj, "erro": msg})
            except Exception as exc:
                with self._lock:
                    self._erros.append({"cnpj": cnpj, "erro": str(exc)})
            finally:
                with self._lock:
                    self._processados += 1

            time.sleep(delay)

        with self._lock:
            self._em_andamento = False


# ---------------------------------------------------------------------------
# Instância global (uma por processo)
# ---------------------------------------------------------------------------

_job = EnriquecimentoJob()


def iniciar_enriquecimento(cnpj_list: List[str], db_path: Path) -> bool:
    """Inicia enriquecimento em lote. Retorna False se já em andamento."""
    return _job.iniciar(cnpj_list, db_path)


def status_enriquecimento() -> Dict[str, Any]:
    """Retorna o status atual do job."""
    return _job.status
