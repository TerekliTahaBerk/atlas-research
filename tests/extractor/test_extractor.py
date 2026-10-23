"""Offline extraction boundary tests. All subprocesses are controlled doubles."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('atlas_extractor', Path(__file__).parents[2]/'ops/extractor/extractor.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ExtractorTests(unittest.TestCase):
    def extract(self, text, code=0):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'source.pdf'
            path.write_bytes(b'%PDF-1.7\n%%EOF')
            def run(args, **kwargs):
                self.assertEqual(args[:3], ['pdftotext', '-enc', 'UTF-8'])
                self.assertEqual(kwargs['timeout'], 35)
                self.assertIs(kwargs['stderr'], subprocess.DEVNULL)
                self.assertEqual(kwargs['env'], {'PATH': '/usr/bin:/bin', 'HOME': '/tmp'})
                (Path(directory)/'pages.txt').write_text(text)
                return subprocess.CompletedProcess(args, code)
            with patch.object(module.subprocess, 'run', side_effect=run):
                return module.extract(path)

    def test_preserves_page_text_and_unicode(self):
        self.assertEqual(self.extract('Exact 😀 evidence.\n\fSecond page.\n\f'), [{'page': 1, 'text': 'Exact 😀 evidence.\n'}, {'page': 2, 'text': 'Second page.\n'}])
    def test_rejects_parser_failure(self):
        with self.assertRaises(ValueError): self.extract('text', 1)
    def test_rejects_page_overflow(self):
        with self.assertRaises(ValueError): self.extract('page\f'*501)
    def test_rejects_content_overflow(self):
        with self.assertRaises(ValueError): self.extract('x'*500001)
    def test_rejects_nul_text(self):
        with self.assertRaises(ValueError): self.extract('unsafe\0text')
    def test_subprocess_timeout_propagates(self):
        with patch.object(module.subprocess, 'run', side_effect=subprocess.TimeoutExpired('pdftotext',35)):
            with self.assertRaises(subprocess.TimeoutExpired): module.extract(Path('/tmp/unused-atlas-fixture.pdf'))

if __name__ == '__main__': unittest.main()
