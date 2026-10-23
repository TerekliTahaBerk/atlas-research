"""Untrusted-PDF boundary: no credentials, no Internet, serial bounded scans."""
import hashlib
import http.server
import json
from pathlib import Path
import resource
import subprocess
import tempfile
import time

MAX_BYTES = 26_214_400


def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (40, 40))
    resource.setrlimit(resource.RLIMIT_AS, (2_684_354_560, 2_684_354_560))
    resource.setrlimit(resource.RLIMIT_FSIZE, (33_554_432, 33_554_432))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run(arguments, output=False):
    # No shell, inherited secrets, parser output or research text in logs.
    return subprocess.run(arguments, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE if output else subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, timeout=45, check=False,
                          env={"PATH": "/usr/bin:/bin", "HOME": "/tmp"},
                          preexec_fn=limits)


def inspect(path):
    signatures = list(Path('/signatures').glob('daily.*'))
    if not signatures or max(p.stat().st_mtime for p in signatures) < time.time()-172800:
        return 'ERROR'  # stale/missing malware definitions fail closed
    malware = run(['clamscan', '--database=/signatures', '--max-filesize=26M',
                   '--max-scansize=64M', '--max-recursion=8', '--max-files=256',
                   '--alert-exceeds-max=yes', '--alert-encrypted=yes',
                   '--no-summary', str(path)])
    if malware.returncode == 1:
        return 'INFECTED'
    if malware.returncode != 0:
        return 'ERROR'
    # Warnings, recovery, malformed streams and encrypted PDFs are rejected.
    if run(['qpdf', '--check', str(path)]).returncode != 0:
        return 'INVALID'
    encrypted = run(['qpdf', '--is-encrypted', str(path)])
    if encrypted.returncode == 0:
        return 'INVALID'
    if encrypted.returncode != 2:
        return 'ERROR'
    pages = run(['qpdf', '--show-npages', str(path)], output=True)
    if pages.returncode != 0 or len(pages.stdout) > 32:
        return 'INVALID'
    try:
        return 'CLEAN' if 1 <= int(pages.stdout) <= 2000 else 'INVALID'
    except ValueError:
        return 'INVALID'


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        self.connection.settimeout(15)
        if self.path != '/scan':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 8 <= size <= MAX_BYTES or self.headers.get('Transfer-Encoding'):
                self.send_error(413)
                return
            digest = hashlib.sha256()
            with tempfile.TemporaryDirectory(dir='/tmp') as directory:
                path = Path(directory)/'source.pdf'
                remaining = size
                with path.open('wb') as target:
                    while remaining:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk:
                            raise ValueError('truncated')
                        remaining -= len(chunk)
                        digest.update(chunk)
                        target.write(chunk)
                verdict = inspect(path)
            body = json.dumps({'verdict': verdict, 'sha256': digest.hexdigest()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(503)  # no parser diagnostics or file content


if __name__ == '__main__':
    # One parser at a time; the container also caps memory, CPUs and PIDs.
    http.server.HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
