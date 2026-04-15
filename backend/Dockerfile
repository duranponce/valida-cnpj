# Build a partir da raiz do repositório: docker build -f backend/Dockerfile .
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONPATH=/app/backend/src
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY backend/src /app/backend/src
COPY frontend /app/frontend
EXPOSE 5000
CMD ["python", "-m", "valida_cnpj"]
