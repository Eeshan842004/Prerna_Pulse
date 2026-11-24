# Build from the repository root:  docker build -f backend/Dockerfile .
FROM python:3.12-slim
WORKDIR /srv/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /srv/backend/
COPY web/ /srv/web/
ENV PP_WEB_DIR=/srv/web
EXPOSE 8000
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
