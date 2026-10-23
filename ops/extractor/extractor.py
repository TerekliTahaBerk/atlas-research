"""Secret-free, offline, bounded PDF text extraction. No OCR or arbitrary execution."""
import hashlib
import http.server
import json
from pathlib import Path
import resource
import subprocess
import tempfile

MAX_BYTES = 26_214_400


def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_AS, (536870912, 536870912))
    resource.setrlimit(resource.RLIMIT_FSIZE, (2100000, 2100000))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def extract(path):
    output = path.parent/'pages.txt'
    result = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-eol', 'unix', '-f', '1', '-l', '501', str(path), str(output)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                            env={'PATH': '/usr/bin:/bin', 'HOME': '/tmp'}, preexec_fn=limits, timeout=35, check=False)
    if result.returncode or not output.exists() or output.stat().st_size > 2000000:
        raise ValueError('extraction failed')
    pages = output.read_text(encoding='utf-8', errors='strict').split('\f')
    if pages[-1] == '':
        pages.pop()
    if not 1 <= len(pages) <= 500 or sum(len(p) for p in pages) > 500000 or any('\0' in p for p in pages):
        raise ValueError('extraction limit')
    return [{'page': i+1, 'text': text} for i, text in enumerate(pages)]


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        self.connection.settimeout(15)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if self.path != '/extract' or not 8 <= size <= MAX_BYTES or self.headers.get('Transfer-Encoding'):
                self.send_error(413)
                return
            digest = hashlib.sha256()
            with tempfile.TemporaryDirectory(dir='/tmp') as directory:
                path = Path(directory)/'source.pdf'
                with path.open('wb') as target:
                    remaining = size
                    while remaining:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk:
                            raise ValueError('truncated')
                        target.write(chunk)
                        digest.update(chunk)
                        remaining -= len(chunk)
                pages = extract(path)
            body = json.dumps({'sha256': digest.hexdigest(), 'pages': pages}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(503)


if __name__ == '__main__':
    http.server.HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
