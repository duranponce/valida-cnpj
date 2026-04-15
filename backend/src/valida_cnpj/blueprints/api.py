"""JSON /api/* (proxy CNPJ, arquivados, health, auth API, entidades, enriquecimento)."""
from __future__ import annotations

import os

from flask import Blueprint, jsonify, redirect, request, send_file, session, url_for

from valida_cnpj.config import (
    APPLICATION_ROOT,
    ARQUIVADOS_DIR,
    CONSULTAS_LOG_PATH,
    DATA_DIR,
    DB_PATH,
    EXPORTADOS_DIR,
)
from valida_cnpj.services import consultas_log, receitaws
from valida_cnpj.services import database as db_svc
from valida_cnpj.services import enriquecimento as enr_svc
from valida_cnpj.services.pdf_upload import save_pdf_arquivados_response
from valida_cnpj.services.storage import list_pdf_files, safe_storage_name

api_bp = Blueprint("api", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _dashboard_stats_payload():
    consultas = consultas_log.load_consultas_log(CONSULTAS_LOG_PATH)
    total = len(consultas)
    arquivados = list_pdf_files(str(ARQUIVADOS_DIR))
    arq_count = len(arquivados)
    recent = []
    for row in consultas[-15:]:
        if isinstance(row, dict):
            recent.append(row)
    recent.reverse()
    return {
        "consultas_total": total,
        "arquivados_total": arq_count,
        "ultimas_consultas": recent,
        "servidor": True,
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@api_bp.route("/auth/status", methods=["GET"])
def api_auth_status():
    u = session.get("user")
    return jsonify({"ok": True, "logged_in": bool(u), "user": u or None})


@api_bp.route("/auth/logout", methods=["GET", "POST"])
def api_auth_logout():
    session.clear()
    return redirect(url_for("web.login_page"))


@api_bp.route("/auth/update", methods=["POST", "OPTIONS"])
def api_auth_update():
    """Atualiza usuário e senha no banco."""
    if request.method == "OPTIONS":
        return "", 204
    u = session.get("user")
    if not u:
        return jsonify({"error": "Não autorizado."}), 401
    
    body = request.get_json(silent=True) or {}
    new_user = str(body.get("username") or "").strip()
    new_pass = body.get("password")
    
    if not new_user or not new_pass:
        return jsonify({"error": "Usuário e senha são obrigatórios."}), 400
        
    try:
        db_svc.update_credentials(DB_PATH, new_user, new_pass)
        # Limpa sessão para forçar re-login com novas credenciais
        session.clear()
        return jsonify({"ok": True, "message": "Credenciais atualizadas. Faça login novamente."})
    except Exception as e:
        return jsonify({"error": f"Erro ao atualizar: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# CNPJ proxy (ReceitaWS)
# ---------------------------------------------------------------------------

@api_bp.route("/cnpj/<cnpj>")
def api_cnpj(cnpj):
    ok, digits, err = receitaws.normalize_cnpj_digits(cnpj)
    if not ok:
        return jsonify({"error": err or "CNPJ inválido."}), 400
    data, err2 = receitaws.fetch_cnpj_json(digits)
    if err2:
        return jsonify({"error": err2}), 502
    if data is None or not isinstance(data, dict):
        return jsonify({"error": "Resposta vazia."}), 502
    if data.get("status") != "ERROR":
        consultas_log.append_consulta_log(CONSULTAS_LOG_PATH, DATA_DIR, digits)
        # Upsert na base de dados (preserva flag pinned existente)
        try:
            db_svc.upsert_entidade(DB_PATH, digits, data)
        except Exception:
            pass  # Não falha a resposta por erro no banco local
    return jsonify(data)


# ---------------------------------------------------------------------------
# Dashboard / stats
# ---------------------------------------------------------------------------

@api_bp.route("/dashboard/stats", methods=["GET"])
def api_dashboard_stats():
    return jsonify(_dashboard_stats_payload())


@api_bp.route("/stats", methods=["GET"])
def api_stats_alias():
    return jsonify(_dashboard_stats_payload())


# ---------------------------------------------------------------------------
# Entidades (banco SQLite)
# ---------------------------------------------------------------------------

@api_bp.route("/entidades", methods=["GET"])
def api_entidades_list():
    """
    Lista entidades.
    ?pinned=1   → apenas fixadas
    ?q=termo    → filtra por CNPJ ou nome (usa autocomplete internamente)
    """
    q = (request.args.get("q") or "").strip()
    only_pinned = request.args.get("pinned") == "1"

    if q:
        rows = db_svc.search_autocomplete(DB_PATH, q, limit=50)
        if only_pinned:
            rows = [r for r in rows if r.get("pinned")]
    elif only_pinned:
        rows = db_svc.list_pinned(DB_PATH)
    else:
        rows = db_svc.list_all(DB_PATH)

    # Remove dados_json do listing (payload pesado; use /entidades/<cnpj> para obter)
    for r in rows:
        r.pop("dados_json", None)

    return jsonify({"entidades": rows, "total": len(rows)})


@api_bp.route("/entidades/autocomplete", methods=["GET"])
def api_entidades_autocomplete():
    """Retorna até 8 sugestões para autocomplete no campo CNPJ."""
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"sugestoes": []})
    rows = db_svc.search_autocomplete(DB_PATH, q, limit=8)
    sugestoes = [
        {
            "cnpj": r["cnpj"],
            "razao_social": r["razao_social"],
            "fantasia": r["fantasia"],
            "situacao": r["situacao"],
            "pinned": bool(r.get("pinned")),
        }
        for r in rows
    ]
    return jsonify({"sugestoes": sugestoes})


@api_bp.route("/entidades/<cnpj14>", methods=["GET", "PATCH", "OPTIONS"])
def api_entidade_get_or_patch(cnpj14):
    """GET: dados completos. PATCH: atualiza campos editáveis (body JSON)."""
    if request.method == "OPTIONS":
        return "", 204
    ok, digits, err = receitaws.normalize_cnpj_digits(cnpj14)
    if not ok:
        return jsonify({"error": err or "CNPJ inválido."}), 400
    cnpj14 = digits

    if request.method == "PATCH":
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            return jsonify({"error": "JSON inválido."}), 400
        updated = db_svc.patch_entidade(DB_PATH, cnpj14, body)
        if not updated:
            return jsonify({"error": "Entidade não encontrada."}), 404
        row = db_svc.get_entidade(DB_PATH, cnpj14)
        return jsonify({"ok": True, "entidade": row})

    row = db_svc.get_entidade(DB_PATH, cnpj14)
    if row is None:
        return jsonify({"error": "Entidade não encontrada."}), 404
    return jsonify(row)


@api_bp.route("/entidades/<cnpj14>/pin", methods=["POST", "OPTIONS"])
def api_entidade_pin(cnpj14):
    """Fixa ou desfixa a entidade. Body JSON: { "pinned": true/false }"""
    if request.method == "OPTIONS":
        return "", 204
    body = request.get_json(silent=True) or {}
    pinned = bool(body.get("pinned", True))
    found = db_svc.pin_entidade(DB_PATH, cnpj14, pinned)
    if not found:
        return jsonify({"error": "Entidade não encontrada. Faça a consulta antes de fixar."}), 404
    return jsonify({"ok": True, "cnpj": cnpj14, "pinned": pinned})


# ---------------------------------------------------------------------------
# Enriquecimento
# ---------------------------------------------------------------------------

@api_bp.route("/enriquecimento/processar", methods=["POST", "OPTIONS"])
def api_enriquecimento_processar():
    """
    Inicia o enriquecimento em lote de todas as entidades fixadas
    (ou de uma lista específica passada no body: { "cnpjs": [...] }).
    """
    if request.method == "OPTIONS":
        return "", 204
    body = request.get_json(silent=True) or {}
    cnpjs = body.get("cnpjs")
    if not cnpjs:
        # Usa todas as entidades fixadas
        pinned = db_svc.list_pinned(DB_PATH)
        cnpjs = [r["cnpj"] for r in pinned]
    if not cnpjs:
        return jsonify({"error": "Nenhuma entidade fixada para enriquecer."}), 400
    iniciou = enr_svc.iniciar_enriquecimento(cnpjs, DB_PATH)
    if not iniciou:
        return jsonify({"error": "Já existe um enriquecimento em andamento."}), 409
    return jsonify({"ok": True, "total": len(cnpjs), "mensagem": "Enriquecimento iniciado."})


@api_bp.route("/enriquecimento/status", methods=["GET"])
def api_enriquecimento_status():
    """Retorna o status atual do job de enriquecimento."""
    return jsonify(enr_svc.status_enriquecimento())


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@api_bp.route("/health", methods=["GET"])
def api_health():
    from flask import current_app

    rules = {r.rule for r in current_app.url_map.iter_rules()}
    data_dir = str(DATA_DIR)
    export_dir = str(EXPORTADOS_DIR)
    arq_dir = str(ARQUIVADOS_DIR)
    return jsonify(
        {
            "ok": True,
            "app": "valida-cnpj",
            "package": "valida_cnpj",
            "application_root_env": APPLICATION_ROOT or None,
            "routes": {
                "dashboard_stats": "/api/dashboard/stats" in rules,
                "stats_alias": "/api/stats" in rules,
                "cnpj": any("cnpj" in r and r.startswith("/api/") for r in rules),
                "arquivados_list": "/api/arquivados" in rules,
                "entidades": "/api/entidades" in rules,
                "enriquecimento": "/api/enriquecimento/processar" in rules,
            },
            "storage": {
                "data_dir": data_dir,
                "data_dir_writable": _writable_dir(data_dir),
                "exportados_writable": _writable_dir(export_dir),
                "arquivados_writable": _writable_dir(arq_dir),
                "consultas_log": str(CONSULTAS_LOG_PATH),
                "db_path": str(DB_PATH),
            },
        }
    )


def _writable_dir(path) -> bool:
    try:
        return os.path.isdir(path) and os.access(path, os.W_OK)
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Arquivados / PDFs
# ---------------------------------------------------------------------------

@api_bp.route("/arquivados", methods=["GET", "POST", "OPTIONS"])
def api_arquivados():
    if request.method == "OPTIONS":
        return "", 204
    if request.method == "GET":
        return jsonify({"files": list_pdf_files(str(ARQUIVADOS_DIR))})
    return save_pdf_arquivados_response(str(ARQUIVADOS_DIR), request.files.get("file"))


@api_bp.route("/arquivados/upload", methods=["POST", "OPTIONS"])
def api_arquivados_upload():
    if request.method == "OPTIONS":
        return "", 204
    return save_pdf_arquivados_response(str(ARQUIVADOS_DIR), request.files.get("file"))


@api_bp.route("/salvar_arquivado", methods=["POST", "OPTIONS"])
def api_salvar_arquivado():
    if request.method == "OPTIONS":
        return "", 204
    return save_pdf_arquivados_response(str(ARQUIVADOS_DIR), request.files.get("file"))


@api_bp.route("/arquivados/download/<path:name>")
def api_arquivados_download(name):
    safe = safe_storage_name(name)
    if not safe:
        return jsonify({"error": "Arquivo inválido."}), 400
    path = os.path.join(str(ARQUIVADOS_DIR), safe)
    if not os.path.isfile(path):
        return jsonify({"error": "Não encontrado."}), 404
    # Se inline=1, envia para visualizar no navegador (iframe/aba)
    inline = request.args.get("inline") == "1"
    if inline:
        return send_file(path, mimetype="application/pdf", as_attachment=False)
    return send_file(path, as_attachment=True, download_name=safe)


@api_bp.route("/arquivados/eliminar/<path:name>", methods=["DELETE", "POST", "OPTIONS"])
def api_arquivados_delete(name):
    """Exclui um arquivo PDF da pasta arquivados/ no servidor."""
    if request.method == "OPTIONS":
        return "", 204
    # Se for POST, permitimos para compatibilidade caso DELETE seja bloqueado
    safe = safe_storage_name(name)
    if not safe:
        return jsonify({"error": "Nome de arquivo inválido."}), 400
    path = os.path.join(str(ARQUIVADOS_DIR), safe)
    if not os.path.isfile(path):
        # Log interno (simulado aqui) para depuração: arquivo não encontrado em ARQUIVADOS_DIR
        return jsonify({"error": f"Arquivo {safe} não encontrado no servidor."}), 404
    try:
        os.remove(path)
        return jsonify({"ok": True, "message": f"Arquivo {safe} excluído."})
    except Exception as e:
        return jsonify({"error": f"Erro ao excluir arquivo: {str(e)}"}), 500


@api_bp.route("/arquivados/mover-de-exportados", methods=["POST", "OPTIONS"])
def api_arquivados_mover():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    safe = safe_storage_name(data.get("filename", ""))
    if not safe:
        return jsonify({"error": "Nome inválido."}), 400
    src = os.path.join(str(EXPORTADOS_DIR), safe)
    dst = os.path.join(str(ARQUIVADOS_DIR), safe)
    if not os.path.isfile(src):
        return jsonify({"error": "Arquivo não está em exportados."}), 404
    os.makedirs(str(ARQUIVADOS_DIR), exist_ok=True)
    if os.path.exists(dst):
        return jsonify({"error": "Já existe um arquivo com esse nome em arquivados."}), 409
    os.rename(src, dst)
    return jsonify({"ok": True, "name": safe})


# ---------------------------------------------------------------------------
# Exportados / PDFs
# ---------------------------------------------------------------------------

@api_bp.route("/exportados", methods=["GET", "POST", "OPTIONS"])
def api_exportados():
    if request.method == "OPTIONS":
        return "", 204
    if request.method == "GET":
        return jsonify({"files": list_pdf_files(str(EXPORTADOS_DIR))})
    if "file" not in request.files:
        return jsonify({"error": "Campo file ausente."}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "Arquivo vazio."}), 400
    safe = safe_storage_name(f.filename)
    if not safe:
        return jsonify({"error": "Nome de arquivo inválido (use .pdf)."}), 400
    os.makedirs(str(EXPORTADOS_DIR), exist_ok=True)
    path = os.path.join(str(EXPORTADOS_DIR), safe)
    f.save(path)
    return jsonify({"ok": True, "name": safe})


@api_bp.route("/exportados/download/<path:name>")
def api_exportados_download(name):
    safe = safe_storage_name(name)
    if not safe:
        return jsonify({"error": "Arquivo inválido."}), 400
    path = os.path.join(str(EXPORTADOS_DIR), safe)
    if not os.path.isfile(path):
        return jsonify({"error": "Não encontrado."}), 404
    return send_file(path, as_attachment=True, download_name=safe)
