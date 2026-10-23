FROM python:3.13-slim-bookworm AS broker
WORKDIR /app
COPY scanner/broker.py /app/transport.py
COPY extractor/broker.py /app/broker.py
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "/app/broker.py"]

FROM python:3.13-slim-bookworm AS extractor
RUN apt-get update && apt-get install --no-install-recommends -y poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY extractor/extractor.py /app/extractor.py
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "/app/extractor.py"]
