"""Origin confinement for optional project-scoped preview credentials."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('preview_broker', Path(__file__).parents[2] / 'ops/scanner/broker.py')
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)


class PreviewProtection(unittest.TestCase):
    def test_optional_credential_preserves_unprotected_deployments(self):
        with tempfile.TemporaryDirectory() as directory:
            headers = {'Content-Type': 'application/json'}
            self.assertEqual(broker.protected_api_headers('https://atlas.example', headers, Path(directory)/'absent'), headers)

    def test_credential_is_bound_to_exact_https_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'credential.json'
            path.write_text(json.dumps({'origin': 'https://atlas.example', 'token': 'synthetic.test.signature'}))
            headers = {'x-atlas-scanner-signature': 'test-only'}
            actual = broker.protected_api_headers('https://atlas.example', headers, path)
            self.assertEqual(actual['x-vercel-trusted-oidc-idp-token'], 'synthetic.test.signature')
            self.assertNotIn('x-vercel-trusted-oidc-idp-token', headers)
            for origin in ('https://other.example', 'http://atlas.example', 'https://atlas.example/path', 'https://atlas.example:444'):
                with self.assertRaises(ValueError):
                    broker.protected_api_headers(origin, headers, path)

    def test_storage_download_never_receives_preview_identity(self):
        pdf = b'%PDF-1.7\nsynthetic\n%%EOF\n'
        digest = broker.hashlib.sha256(pdf).hexdigest()
        observed = []
        def request(url, data=None, headers=None, **kwargs):
            observed.append((url, headers))
            return pdf if data is None else json.dumps({'sha256': digest, 'verdict': 'CLEAN'}).encode()
        job = {'downloadUrl': 'https://hgngonpirctrwbckhbmy.supabase.co/storage/v1/object/sign/atlas-quarantine/test', 'sha256': digest, 'byteSize': len(pdf)}
        with patch.object(broker, 'request', request), patch.object(broker, 'protected_api_headers', side_effect=AssertionError('credential must not be read')):
            self.assertEqual(broker.scan_job(job), ('CLEAN', digest))
        self.assertIsNone(observed[0][1])
        self.assertNotIn('x-vercel-trusted-oidc-idp-token', observed[1][1])


if __name__ == '__main__':
    unittest.main()
