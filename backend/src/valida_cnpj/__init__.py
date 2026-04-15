"""Aplicação Flask: factory create_app."""
from __future__ import annotations

import os

from flask import Flask, jsonify, redirect, request, session, url_for

from valida_cnpj.blueprints import api_bp, web_bp
from valida_cnpj.config import (
    APPLICATION_ROOT,
    ARQUIVADOS_DIR,
    DATA_DIR,
    DB_PATH,
    EXPORTADOS_DIR,
    FRONTEND_CSS,
    FRONTEND_JS,
    FRONTEND_PUBLIC,
)
from valida_cnpj.services.database import init_db


def _is_public_path(path: str, method: str) -> bool:
    if path.startswith("/css/") or path.startswith("/js/"):
        return True
    if path == "/favicon.ico" and method in ("GET", "HEAD"):
        return True
    # Login e favicon usam /logo.png; sem sessão o middleware bloqueava e o <img> recebia HTML (imagem “quebrada”).
    if path == "/logo.png" and method in ("GET", "HEAD"):
        return True
    if path == "/api/health":
        return True
    if path == "/login" and method in ("GET", "POST"):
        return True
    if path == "/logout":
        return True
    if path == "/api/auth/logout" and method in ("GET", "POST"):
        return True
    return False


def create_app() -> Flask:
    os.makedirs(str(EXPORTADOS_DIR), exist_ok=True)
    os.makedirs(str(ARQUIVADOS_DIR), exist_ok=True)
    os.makedirs(str(DATA_DIR), exist_ok=True)
    init_db(DB_PATH)

    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "valida-cnpj-dev-secret-change-in-production")
    app.url_map.strict_slashes = False

    app.config["FRONTEND_PUBLIC"] = str(FRONTEND_PUBLIC)
    app.config["FRONTEND_CSS"] = str(FRONTEND_CSS)
    app.config["FRONTEND_JS"] = str(FRONTEND_JS)
    # Fase 2 (opcional): registrar blueprints com url_prefix == APPLICATION_ROOT e alinhar meta application-root.
    app.config["APPLICATION_ROOT"] = APPLICATION_ROOT or ""

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, HEAD"
        req_h = request.headers.get("Access-Control-Request-Headers")
        if req_h:
            response.headers["Access-Control-Allow-Headers"] = req_h
        else:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @app.before_request
    def require_login():
        if request.method == "OPTIONS":
            return None
        if _is_public_path(request.path, request.method):
            return None
        if session.get("user"):
            return None
        if request.path.startswith("/api/"):
            return jsonify({"error": "Não autorizado. Faça login em /login"}), 401
        return redirect(url_for("web.login_page"))

    app.register_blueprint(api_bp)
    app.register_blueprint(web_bp)

    return app
