"""Only the broker holds the narrow extraction HMAC key; never DB/Storage keys."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import time
import urllib.parse
import uuid
from transport import request, MAX_BYTES


def api(origin, secret, action, payload):
    body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    path = 'internal/extraction/'+action
    signature = hmac.new(secret, path.encode()+b'.'+timestamp.encode()+b'.'+body, hashlib.sha256).hexdigest()
    return json.loads(request(origin+'/api/v1/'+path, body, {'Content-Type': 'application/json', 'x-atlas-extraction-timestamp': timestamp, 'x-atlas-extraction-signature': signature}, maximum=65536, timeout=180))['data']


def main():
    origin = os.environ['ATLAS_EXTRACTION_ORIGIN'].rstrip('/')
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != 'https' or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.port not in (None, 443):
        raise ValueError('approved HTTPS origin required')
    project = os.environ['ATLAS_EXTRACTION_PROJECT']
    if project != 'hgngonpirctrwbckhbmy':
        raise ValueError('only Atlas development is approved')
    secret = Path('/run/secrets/extraction_secret').read_bytes().strip()
    if len(secret) < 32:
        raise ValueError('secret too short')
    while True:
        try:
            job = api(origin, secret, 'claim', {})
            if not job:
                time.sleep(5)
                continue
            uuid.UUID(job['jobId'])
            url = urllib.parse.urlsplit(job['downloadUrl'])
            if url.scheme != 'https' or url.netloc != project+'.supabase.co' or url.username or url.fragment or not url.path.startswith('/storage/v1/object/sign/atlas-sources/'):
                raise ValueError('unapproved grant')
            body = request(job['downloadUrl'], maximum=MAX_BYTES)
            if hashlib.sha256(body).hexdigest() != job['sha256'] or len(body) != job['byteSize']:
                raise ValueError('integrity failure')
            try:
                result = json.loads(request('http://extractor:8080/extract', body, {'Content-Type': 'application/pdf'}, maximum=2100000, timeout=45))
                if result['sha256'] != job['sha256']:
                    raise ValueError('integrity failure')
                api(origin, secret, 'complete', {'jobId': job['jobId'], 'attempt': job['attempt'], **result})
            except (OSError, ValueError, KeyError):
                api(origin, secret, 'complete', {'jobId': job['jobId'], 'attempt': job['attempt'], 'sha256': job['sha256'], 'pages': [{'page': 1, 'text': ''}], 'failed': True})
        except (OSError, ValueError, KeyError, TypeError):
            print('Extraction unavailable; retrying after backoff.', flush=True)
            time.sleep(30)


if __name__ == '__main__':
    main()
