"""Recovery boundary tests: no database/network calls and no .env loading."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('restore', Path(__file__).with_name('rehearse_restore.py'))
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class RecoveryBoundaryTests(unittest.TestCase):
    def test_accepts_explicit_postgres_loopback_fixture(self):
        url = 'postgresql://fixture@127.0.0.1:55439/atlas_p01_test_recovery'
        with patch.dict(restore.os.environ, {'ATLAS_TEST_ADMIN_URL': url}):
            self.assertEqual(restore.connection('ATLAS_TEST_ADMIN_URL'), url)

    def test_rejects_remote_nonfixture_and_libpq_host_overrides(self):
        for url in (
            'postgresql://fixture@example.org/atlas_p01_test',
            'postgresql://fixture@127.0.0.1/real_research',
            'http://127.0.0.1/atlas_p01_test',
            'postgresql://fixture@127.0.0.1/atlas_p01_test?host=example.org',
            'postgresql://fixture@localhost/atlas_p01_test?service=hosted',
            'postgresql://fixture@localhost/atlas_p01_test#unexpected',
        ):
            with self.subTest(url=url), patch.dict(restore.os.environ, {'ATLAS_TEST_ADMIN_URL': url}):
                with self.assertRaises(ValueError):
                    restore.connection('ATLAS_TEST_ADMIN_URL')

    def test_rejects_different_fixture_endpoint_before_connecting(self):
        for worker in ('postgresql://worker@127.0.0.1:55440/atlas_p01_test',
                       'postgresql://worker@127.0.0.1:55439/atlas_p01_test_other'):
            env = {'ATLAS_TEST_ADMIN_URL': 'postgresql://owner@127.0.0.1:55439/atlas_p01_test',
                   'ATLAS_TEST_DATABASE_URL': 'postgresql://runtime@127.0.0.1:55439/atlas_p01_test',
                   'ATLAS_TEST_AI_WORKER_URL': worker}
            with patch.dict(restore.os.environ, env), patch.object(restore, 'sql') as sql:
                with self.assertRaises(ValueError):
                    restore.main()
                sql.assert_not_called()


if __name__ == '__main__':
    unittest.main()
