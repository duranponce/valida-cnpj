"""Páginas HTML, estáticos /css /js e rota curta /salvar_pdf."""
from __future__ import annotations

import base64

from flask import Blueprint, Response, redirect, request, send_from_directory, session, url_for

from valida_cnpj.config import (
    APP_PASS,
    APP_USER,
    ARQUIVADOS_DIR,
    FRONTEND_CSS,
    FRONTEND_JS,
    FRONTEND_PUBLIC,
)
from valida_cnpj.services.pdf_upload import save_pdf_arquivados_response


web_bp = Blueprint("web", __name__)


def _save_pdf_response():
    return save_pdf_arquivados_response(str(ARQUIVADOS_DIR), request.files.get("file"))


@web_bp.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "GET":
        if session.get("user"):
            return redirect(url_for("web.dashboard_page"))
        return send_from_directory(str(FRONTEND_PUBLIC), "login.html")
    user = (request.form.get("username") or "").strip()
    pw = request.form.get("password") or ""
    if user == APP_USER and pw == APP_PASS:
        session["user"] = user
        return redirect(url_for("web.dashboard_page"))
    return redirect(url_for("web.login_page", err=1))


@web_bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("web.login_page"))


@web_bp.route("/")
def root():
    if not session.get("user"):
        return redirect(url_for("web.login_page"))
    return redirect(url_for("web.dashboard_page"))


def _spa_index():
    return send_from_directory(str(FRONTEND_PUBLIC), "index.html")


@web_bp.route("/dashboard")
def dashboard_page():
    return _spa_index()


@web_bp.route("/consulta")
def consulta_page():
    return _spa_index()


@web_bp.route("/salvas")
def salvas_page():
    return _spa_index()


@web_bp.route("/arquivados")
def arquivados_page():
    return _spa_index()


@web_bp.route("/config")
def config_page():
    return _spa_index()


@web_bp.route("/enriquecimento")
def enriquecimento_page():
    return _spa_index()


@web_bp.route("/favicon.ico")
def favicon():
    return send_from_directory(str(FRONTEND_PUBLIC), "logo.png")


@web_bp.route("/logo.png")
def serve_logo():
    return send_from_directory(str(FRONTEND_PUBLIC), "logo.png")


@web_bp.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(str(FRONTEND_CSS), filename)


@web_bp.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(str(FRONTEND_JS), filename)


@web_bp.route("/salvar_pdf", methods=["POST", "OPTIONS"])
def salvar_pdf_root():
    if request.method == "OPTIONS":
        return "", 204
    return _save_pdf_response()
