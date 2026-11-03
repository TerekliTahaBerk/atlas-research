"""Lease-aware scanner broker. Only this process holds the scanner HMAC key."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

MAX_BYTES = 26_214_400


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        raise ValueError('redirect refused')


# No ambient proxy forwarding of signed URLs or HMAC requests.
HTTP = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))


def protected_api_headers(origin, headers, credential_path=Path('/run/secrets/vercel_access.json')):
    """Project-scoped OIDC goes only to the exact approved Atlas API origin.

    Generic request()/Storage downloads deliberately never read this credential.
    The host refreshes the short-lived token; parsers never mount this file.
    """
    if not credential_path.exists():
        return headers
    credential = json.loads(credential_path.read_text())
    parsed = urllib.parse.urlsplit(origin)
    token = credential.get('token')
    if (credential.get('origin') != origin or parsed.scheme != 'https'
            or parsed.path or parsed.query or parsed.fragment or parsed.username
            or parsed.port not in (None, 443) or not isinstance(token, str)
            or len(token) > 32768
            or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token)):
        raise ValueError('invalid origin-bound preview credential')
    return {**headers, 'x-vercel-trusted-oidc-idp-token': token}


def read_bounded(response, maximum):
    body = bytearray()
    deadline = time.monotonic() + 30
    while True:
        chunk = response.read(min(65536, maximum+1-len(body)))
        if not chunk:
            return bytes(body)
        body.extend(chunk)
        if len(body) > maximum or time.monotonic() > deadline:
            raise ValueError('response bound exceeded')


def request(url, data=None, headers=None, maximum=65536, timeout=15):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with HTTP.open(req, timeout=timeout) as response:
        return read_bounded(response, maximum)


def api(origin, secret, action, payload):
    body = json.dumps(payload, separators=(',', ':')).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(secret, timestamp.encode()+b'.'+body, hashlib.sha256).hexdigest()
    return json.loads(request(origin+'/api/v1/internal/scanner/'+action, body, protected_api_headers(origin, {
        'Content-Type': 'application/json',
        'x-atlas-scanner-timestamp': timestamp,
        'x-atlas-scanner-signature': signature,
    })))['data']


def validate_job(job, storage_host):
    uuid.UUID(job['jobId'])
    if type(job['attempt']) is not int or not 1 <= job['attempt'] <= 5:
        raise ValueError('invalid attempt')
    if not re.fullmatch('[a-f0-9]{64}', job['sha256']):
        raise ValueError('invalid digest')
    if type(job['byteSize']) is not int or not 8 <= job['byteSize'] <= MAX_BYTES:
        raise ValueError('invalid size')
    url = urllib.parse.urlsplit(job['downloadUrl'])
    if (url.scheme != 'https' or url.netloc != storage_host or url.username
            or url.fragment or not url.path.startswith('/storage/v1/object/sign/atlas-quarantine/')):
        raise ValueError('unapproved storage grant')


def scan_job(job):
    measured = job['sha256']
    try:
        body = request(job['downloadUrl'], maximum=MAX_BYTES)
        measured = hashlib.sha256(body).hexdigest()
        if measured != job['sha256'] or len(body) != job['byteSize']:
            return 'INVALID', measured
        result = json.loads(request('http://validator:8080/scan', body,
                                    {'Content-Type': 'application/pdf'}, timeout=100))
        if result.get('sha256') != measured:
            return 'ERROR', measured
        verdict = result.get('verdict')
        if verdict not in ('CLEAN', 'INFECTED', 'INVALID', 'ERROR'):
            return 'ERROR', measured
        return verdict, measured
    except (OSError, ValueError, KeyError):
        return 'ERROR', measured


def main():
    origin = os.environ['ATLAS_SCANNER_ORIGIN'].rstrip('/')
    parsed = urllib.parse.urlsplit(origin)
    if (parsed.scheme != 'https' or parsed.path or parsed.query or parsed.fragment
            or parsed.username or parsed.port not in (None, 443)):
        raise ValueError('expected approved HTTPS Atlas origin')
    project = os.environ['ATLAS_SCANNER_PROJECT']
    if project != 'hgngonpirctrwbckhbmy':
        raise ValueError('only approved Atlas development project is supported')
    secret = Path('/run/secrets/scanner_secret').read_bytes().strip()
    if len(secret) < 32:
        raise ValueError('scanner secret too short')
    poll_seconds = int(os.environ.get('ATLAS_SCANNER_POLL_SECONDS', '5'))
    if not 5 <= poll_seconds <= 300:
        raise ValueError('scanner idle polling must be between 5 and 300 seconds')
    while True:
        try:
            jobs = api(origin, secret, 'claim', {'max': 1, 'leaseSeconds': 300})
            if not isinstance(jobs, list) or len(jobs) > 1:
                raise ValueError('invalid claims')
            for job in jobs:
                validate_job(job, project+'.supabase.co')
                started = time.monotonic()
                verdict, measured = scan_job(job)
                if time.monotonic()-started > 240:
                    continue  # never complete a lease close to expiry
                api(origin, secret, 'complete', {
                    'jobId': job['jobId'], 'attempt': job['attempt'],
                    'sha256': measured, 'verdict': verdict,
                    'scanner': 'atlas-clamav-qpdf-v1',
                })
            print(json.dumps({'event': 'SCANNER_POLL_OK', 'at': int(time.time()), 'claimed': len(jobs)}), flush=True)
            time.sleep(poll_seconds if not jobs else 1)
        except (OSError, ValueError, KeyError, TypeError):
            print('Scanner operation unavailable; retrying with bounded backoff.', flush=True)
            time.sleep(30)  # no file metadata, URLs, tokens or raw errors


if __name__ == '__main__':
    main()
