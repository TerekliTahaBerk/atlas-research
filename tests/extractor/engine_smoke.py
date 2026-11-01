"""Run in the offline extractor image; actual Poppler, synthetic content only."""
import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('extractor', '/app/extractor.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


def pdf():
    text = b'BT /F1 12 Tf 72 720 Td (Exact synthetic evidence.) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
               b'<< /Length '+str(len(text)).encode()+b' >>\nstream\n'+text+b'\nendstream']
    body = b'%PDF-1.7\n'
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(body))
        body += str(number).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start = len(body)
    body += b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets[1:]:
        body += f'{offset:010d} 00000 n \n'.encode()
    return body+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()


with tempfile.TemporaryDirectory(dir='/tmp') as directory:
    path = Path(directory)/'source.pdf'
    path.write_bytes(pdf())
    assert extractor.extract(path) == [{'page': 1, 'text': 'Exact synthetic evidence.\n\n'}]
    print('PASS: real offline Poppler preserves exact synthetic page text')
    path.write_bytes(b'%PDF-1.7\nmalformed\n%%EOF\n')
    try:
        extractor.extract(path)
    except ValueError:
        print('PASS: real Poppler rejects malformed PDF')
    else:
        raise AssertionError('malformed PDF accepted')
