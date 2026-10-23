"""Protocol/validator fail-closed regressions; engines tested separately."""
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT/'ops'/'scanner'/(name+'.py'))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


broker = module('broker')
validator = module('validator')


class BrokerTests(unittest.TestCase):
    def test_streaming_bound_without_length(self):
        with self.assertRaises(ValueError):
            broker.read_bounded(io.BytesIO(b'x'*4097), 4096)

    def test_redirects_are_refused(self):
        with self.assertRaises(ValueError):
            broker.NoRedirect().redirect_request(None, None, None, None, None, None)

    def test_download_grant_host_and_path_are_fixed(self):
        job = {'jobId': '00000000-0000-4000-8000-000000000001', 'attempt': 1,
               'sha256': 'a'*64, 'byteSize': 10,
               'downloadUrl': 'https://hgngonpirctrwbckhbmy.supabase.co/storage/v1/object/sign/atlas-quarantine/test?token=fixture'}
        broker.validate_job(job, 'hgngonpirctrwbckhbmy.supabase.co')
        for value in ['https://evil.example/source.pdf', 'https://hgngonpirctrwbckhbmy.supabase.co/storage/v1/object/sign/atlas-sources/test']:
            with self.assertRaises(ValueError):
                broker.validate_job({**job, 'downloadUrl': value}, 'hgngonpirctrwbckhbmy.supabase.co')

    def test_hash_mismatch_never_reaches_validator(self):
        with patch.object(broker, 'request', return_value=b'changed') as request:
            verdict, digest = broker.scan_job({'downloadUrl': 'fixture', 'sha256': 'a'*64, 'byteSize': 7})
            self.assertEqual(verdict, 'INVALID')
            self.assertNotEqual(digest, 'a'*64)
            request.assert_called_once()

    def test_missing_validator_is_retryable_error(self):
        with patch.object(broker, 'request', side_effect=OSError()):
            self.assertEqual(broker.scan_job({'downloadUrl': 'fixture', 'sha256': 'a'*64}), ('ERROR', 'a'*64))


class ValidatorTests(unittest.TestCase):
    def inspect_with(self, codes, pages=b'1'):
        definition = SimpleNamespace(stat=lambda: SimpleNamespace(st_mtime=validator.time.time()))
        def result(*_, **__):
            return SimpleNamespace(returncode=codes.pop(0), stdout=pages)
        with patch.object(validator.Path, 'glob', return_value=[definition]), patch.object(validator, 'run', side_effect=result):
            return validator.inspect(Path('/tmp/fixture.pdf'))

    def test_missing_signatures_cannot_be_clean(self):
        with patch.object(validator.Path, 'glob', return_value=[]):
            self.assertEqual(validator.inspect(Path('/tmp/fixture.pdf')), 'ERROR')

    def test_stale_signatures_cannot_be_clean(self):
        definition = SimpleNamespace(stat=lambda: SimpleNamespace(st_mtime=0))
        with patch.object(validator.Path, 'glob', return_value=[definition]):
            self.assertEqual(validator.inspect(Path('/tmp/fixture.pdf')), 'ERROR')

    def test_malware_and_engine_failure(self):
        self.assertEqual(self.inspect_with([1]), 'INFECTED')
        self.assertEqual(self.inspect_with([2]), 'ERROR')

    def test_structure_warnings_and_encryption_are_rejected(self):
        self.assertEqual(self.inspect_with([0, 3]), 'INVALID')
        self.assertEqual(self.inspect_with([0, 0, 0]), 'INVALID')

    def test_page_limit_and_actual_passing_sequence(self):
        self.assertEqual(self.inspect_with([0, 0, 2, 0], b'2001'), 'INVALID')
        self.assertEqual(self.inspect_with([0, 0, 2, 0], b'2'), 'CLEAN')


if __name__ == '__main__':
    unittest.main()
