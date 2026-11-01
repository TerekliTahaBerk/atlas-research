"""Run inside the secret-free validator image with fresh official signatures.

This executes real ClamAV and qpdf. It never contacts Atlas or marks a source READY.
"""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import http.client
import http.server
import sys
import threading
import time

spec = importlib.util.spec_from_file_location('validator', '/app/validator.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def pdf():
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>']
    body = b'%PDF-1.7\n'
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(body))
        body += str(number).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start = len(body)
    body += b'xref\n0 4\n0000000000 65535 f \n'
    for offset in offsets[1:]:
        body += f'{offset:010d} 00000 n \n'.encode()
    return body+f'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()


with tempfile.TemporaryDirectory(dir='/tmp') as directory:
    clean = Path(directory)/'clean.pdf'
    clean.write_bytes(pdf())
    assert validator.inspect(clean) == 'CLEAN', 'real clean PDF did not pass'
    print('PASS: actual ClamAV and qpdf clean PDF')
    invalid = Path(directory)/'invalid.pdf'
    invalid.write_bytes(b'%PDF-1.7\nmalformed\n%%EOF\n')
    assert validator.inspect(invalid) == 'INVALID', 'malformed PDF accepted'
    print('PASS: actual structural rejection')
    encrypted = Path(directory)/'encrypted.pdf'
    subprocess.run(['qpdf', '--encrypt', 'test-user', 'test-owner', '256', '--', str(clean), str(encrypted)], check=True)
    assert validator.inspect(encrypted) in ('INFECTED', 'INVALID'), 'encrypted PDF accepted'
    print('PASS: actual encrypted PDF rejection')
    eicar = Path(directory)/'antivirus-test.txt'
    eicar.write_bytes(b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$'+b'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
    assert validator.inspect(eicar) == 'INFECTED', 'standard antivirus test not detected'
    print('PASS: actual ClamAV EICAR detection')

# Exercise the real HTTP boundary without transmitting an oversized object.
server = http.server.HTTPServer(('127.0.0.1', 0), validator.Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    client = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
    client.request('POST', '/scan', headers={'Content-Length': str(validator.MAX_BYTES+1)})
    assert client.getresponse().status == 413, 'oversized scan was accepted'
    client.close()
    print('PASS: actual HTTP oversized rejection')
finally:
    server.shutdown()
    server.server_close()
    thread.join()

# Real subprocess watchdog (not a mocked TimeoutExpired). No PDF or network.
started = time.monotonic()
try:
    validator.run([sys.executable, '-c', 'import time; time.sleep(60)'])
except subprocess.TimeoutExpired:
    assert time.monotonic()-started < 55, 'watchdog exceeded its deadline'
    print('PASS: actual 45-second subprocess timeout')
else:
    raise AssertionError('scanner subprocess watchdog did not fire')
