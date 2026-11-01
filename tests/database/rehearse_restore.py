"""Synthetic CI-only recovery rehearsal. Never loads .env or exports hosted data."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4


def connection(name):
    value = os.environ[name]
    parsed = urlsplit(value)
    if parsed.hostname not in ('127.0.0.1', 'localhost') or not parsed.path.startswith('/atlas_p01_test'):
        raise ValueError('Explicit disposable loopback Atlas database required')
    return value


def run(args, env=None):
    # No raw connection errors/credentials in CI diagnostics.
    result = subprocess.run(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed (exit {result.returncode}); inspect the disposable target privately')
    return result.stdout.strip()


def sql(url, statement):
    return run(['psql', '--dbname', url, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement])


def retarget(url, database):
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path='/' + database))


def snapshot(url):
    tables = json.loads(sql(url, "SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'"))
    counts = {name: sql(url, 'SELECT count(*) FROM public."' + name.replace('"', '""') + '"') for name in tables}
    history = sql(url, 'SELECT json_agg(row(migration_name,checksum,finished_at IS NOT NULL,rolled_back_at) ORDER BY migration_name) FROM public._prisma_migrations')
    constraints = sql(url, "SELECT json_agg(row(c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='public'::regnamespace")
    policies = sql(url, "SELECT json_agg(row(tablename,policyname,roles,cmd,qual,with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public'")
    return counts, history, constraints, policies


def main():
    source = connection('ATLAS_TEST_ADMIN_URL')
    runtime = connection('ATLAS_TEST_DATABASE_URL')
    worker = connection('ATLAS_TEST_AI_WORKER_URL')
    if any(urlsplit(value).path != urlsplit(source).path for value in (runtime, worker)):
        raise ValueError('All fixture connections must name the same database')
    if int(sql(source, 'SHOW server_version_num')) // 10000 != 17:
        raise ValueError('PostgreSQL 17 required')
    target_name = 'atlas_p01_test_restore_' + uuid4().hex
    target = retarget(source, target_name)
    started = time.monotonic()
    expected = snapshot(source)
    sql(source, 'CREATE DATABASE ' + target_name)
    try:
        with tempfile.TemporaryDirectory(prefix='atlas-a01-synthetic-') as directory:
            dump = Path(directory) / 'synthetic.dump'
            run(['pg_dump', '--dbname', source, '--format=custom', '--file', str(dump)])
            dump.chmod(0o600)
            run(['pg_restore', '--exit-on-error', '--dbname', target, str(dump)])
        if snapshot(target) != expected:
            raise RuntimeError('Restored counts/history/constraints/policies differ')
        env = {**os.environ, 'DIRECT_URL': target,
               'ATLAS_TEST_ADMIN_URL': target,
               'ATLAS_TEST_DATABASE_URL': retarget(runtime, target_name),
               'ATLAS_TEST_AI_WORKER_URL': retarget(worker, target_name)}
        run(['pnpm', '--filter', '@atlas/database', 'exec', 'prisma', 'migrate', 'deploy'], env)
        # Re-run the actual services/RLS/worker/actor-pool tests after restoring.
        run(['pnpm', 'test:integration'], env)
        print(f'PASS: isolated synthetic DB restore; {len(expected[0])} table counts, history checksums, constraints, policies, repeat deploy and integration suite; {time.monotonic()-started:.1f}s')
        print('LIMIT: same-cluster roles; no hosted Auth/Storage metadata or object bytes; not a hosted recovery proof')
    finally:
        sql(source, 'DROP DATABASE ' + target_name)


if __name__ == '__main__':
    main()
