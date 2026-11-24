# A gateway needs only the Python standard library (add `pip install bleak` for real Bluetooth).
FROM python:3.12-slim
WORKDIR /srv
COPY gateway.py .
RUN mkdir -p /srv/queue && chown nobody /srv/queue
WORKDIR /srv/queue
USER nobody
CMD ["python", "/srv/gateway.py"]
