FROM python:3.13-slim-bookworm AS broker
WORKDIR /app
COPY broker.py /app/broker.py
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "/app/broker.py"]

FROM python:3.13-slim-bookworm AS validator
RUN apt-get update && apt-get install --no-install-recommends -y clamav clamav-freshclam qpdf \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /signatures && chown 10001:10001 /signatures \
    && printf 'DatabaseDirectory /signatures\nDatabaseOwner scanner\nDatabaseMirror database.clamav.net\nChecks 12\nForeground yes\n' > /etc/clamav/freshclam.conf \
    && echo 'scanner:x:10001:10001::/tmp:/usr/sbin/nologin' >> /etc/passwd
WORKDIR /app
COPY validator.py /app/validator.py
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "/app/validator.py"]
