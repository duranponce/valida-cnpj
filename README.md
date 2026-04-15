# Valida CNPJ

Aplicação web (Flask + SPA) para consultar CNPJ via ReceitaWS, endereço via ViaCEP, exportar PDF e gerir arquivos em `exportados/` e `arquivados/`.

## Requisitos

- Python 3.10+ (recomendado 3.12)
- Dependências: `Flask`, `requests`

## Instalação e execução local

Na raiz do repositório:

```bash
pip install -r requirements.txt
python app.py
```

Abra no navegador: **http://127.0.0.1:5000** (ou `http://localhost:5000`).

Mantenha o mesmo host durante a sessão (cookies): evite alternar entre `127.0.0.1` e `localhost`.

### Credenciais (login)

Valores padrão (altere em produção com variáveis de ambiente):

| Variável | Padrão |
|----------|--------|
| `VALIDA_CNPJ_USER` | `valida.admin` |
| `VALIDA_CNPJ_PASS` | `CNPJ-2026-Seguro!` |

Chave de sessão Flask:

| Variável | Descrição |
|----------|-----------|
| `FLASK_SECRET_KEY` | Obrigatório em produção; em desenvolvimento existe um valor padrão apenas para testes. |

### Pastas de dados

Por defeito (na raiz do repo):

- `data/` — log de consultas (`consultas_log.json`)
- `exportados/` — PDFs exportados
- `arquivados/` — PDFs arquivados no servidor

Pode redireccionar com:

| Variável | Função |
|----------|--------|
| `DATA_DIR` | Pasta para `consultas_log.json` |
| `EXPORTADOS_DIR` | PDFs exportados |
| `ARQUIVADOS_DIR` | PDFs arquivados |

## Estrutura do repositório

```
valida-cnpj/
├── app.py                 # Entrada: python app.py
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── wsgi.py            # Ex.: gunicorn (ver abaixo)
│   └── src/valida_cnpj/   # Pacote Flask (create_app, blueprints, serviços)
├── frontend/
│   ├── public/            # index.html, login.html
│   ├── css/
│   └── js/                # SPA (app.js)
├── deploy/                # docker-compose.yml, nginx.conf (opcional)
├── scripts/smoke_routes.py
└── ValidaCNPJ.py          # Script de referência (fluxo ReceitaWS/ViaCEP)
```

## Outras formas de arrancar o servidor

Com `PYTHONPATH` apontando para `backend/src`:

```bash
# Windows (PowerShell)
$env:PYTHONPATH = "backend\src"
python -m valida_cnpj
```

Ou, a partir da raiz, importar a app WSGI (ex.: Gunicorn):

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 backend.wsgi:app
```

## Docker

Na raiz do repositório (o contexto de build é a raiz; o Dockerfile está em `backend/`):

```bash
docker build -f backend/Dockerfile -t valida-cnpj .
docker run --rm -p 5000:5000 ^
  -v "%CD%\data:/app/data" ^
  -v "%CD%\exportados:/app/exportados" ^
  -v "%CD%\arquivados:/app/arquivados" ^
  -e DATA_DIR=/app/data ^
  -e EXPORTADOS_DIR=/app/exportados ^
  -e ARQUIVADOS_DIR=/app/arquivados ^
  valida-cnpj
```

(Linux/macOS: troque os volumes por caminhos equivalentes com `-v $(pwd)/data:/app/data` etc.)

Com Docker Compose (ficheiro em `deploy/`):

```bash
cd deploy
docker compose up --build
```

## Smoke (verificação rápida)

Sem servidor HTTP (usa o cliente de teste do Flask):

```bash
python scripts/smoke_routes.py
```

Com servidor já a correr:

```bash
set SMOKE_BASE=http://127.0.0.1:5000
python scripts/smoke_routes.py
```

## Frontend: preview e URLs

- **`meta name="api-base"`** em `frontend/public/index.html` e `login.html`: se abrir o HTML noutra porta (ex.: preview do editor), deixe vazio para o mesmo host ou defina `http://127.0.0.1:5000` para apontar ao Flask.
- **`meta name="application-root"`**: prefixo de **páginas** da SPA (ex.: subpasta atrás de reverse proxy). Na fase actual, rotas `/api/*` e estáticos `/css`, `/js` **não** usam esse prefixo no cliente; alinhe com o servidor antes de publicar só com prefixo nas páginas.

Pode ainda definir `localStorage.apiBaseOverride` no navegador (mesma lógica que `api-base`).

## CI

O workflow em `.github/workflows/ci.yml` instala dependências e executa `scripts/smoke_routes.py`.

## Saúde da API

`GET /api/health` — JSON com estado da app, rotas relevantes e pastas configuradas.

---

Consultas e PDFs dependem da rede (ReceitaWS) e das permissões das pastas acima.
