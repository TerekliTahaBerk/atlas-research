"""Owner-approved Atlas G2 capture. Plaintext goes only through pipes into age.

Requires protected local PGSERVICEFILE/PGPASSFILE already authorized by owner.
Never loads .env, accepts another project, or changes the source.
"""
import configparser
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from datetime import datetime, timezone

ROOT = Path('/Users/berk.terekli/AtlasRecovery/2026-11-02')
PG = Path('/opt/homebrew/opt/postgresql@17/bin')
REPO = Path(__file__).resolve().parents[2]
SOURCE = 'service=atlas_a01_source'


def environment():
    conf = configparser.ConfigParser()
    conf.read(ROOT / 'pg_service.conf')
    source = conf['atlas_a01_source']
    allowed = [('aws-0-ap-northeast-2.pooler.supabase.com', 'postgres.hgngonpirctrwbckhbmy'),
               ('db.hgngonpirctrwbckhbmy.supabase.co', 'postgres')]
    if ((source['host'], source['user']) not in allowed or source['dbname'] != 'postgres'
            or source['sslmode'] != 'verify-full' or source['port'] != '5432'):
        raise RuntimeError('Exact approved Atlas target/TLS required')
    for name in ['pgpass', 'pg_service.conf']:
        info = (ROOT / name).stat()
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('Private owner-only credential configuration required')
    return {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LC_ALL': 'C',
            'PGSERVICEFILE': str(ROOT / 'pg_service.conf'), 'PGPASSFILE': str(ROOT / 'pgpass'),
            'PGAPPNAME': 'atlas-approved-g2-readonly', 'PGOPTIONS': '-c default_transaction_read_only=on'}


def command(args, env):
    r = subprocess.run(args, env=env, capture_output=True)
    if r.returncode:
        # Never print provider stderr, connection details, row context or secrets.
        raise RuntimeError(f'{Path(args[0]).name} failed, exit {r.returncode}; protected capture stopped')
    return r.stdout


def sql(statement, env):
    return command([str(PG / 'psql'), SOURCE, '-w', '-X', '-q', '-A', '-t',
                    '-v', 'ON_ERROR_STOP=1', '-c', statement], env)


def encrypted(args, output, env):
    temporary = output.with_suffix(output.suffix + '.partial')
    exporter = subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    cipher = subprocess.Popen(['age', '--encrypt', '-R', str(ROOT / 'recipients.txt'), '-o', str(temporary)],
                              stdin=exporter.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    exporter.stdout.close()
    try:
        cipher.communicate(timeout=300)
        exporter.communicate(timeout=30)
        if cipher.returncode or exporter.returncode:
            raise RuntimeError('Encrypted export failed; partial ciphertext is not a valid backup')
        temporary.chmod(0o600)
        temporary.rename(output)
    finally:
        for process in [exporter, cipher]:
            if process.poll() is None:
                process.kill()
                process.wait()


def main():
    os.umask(0o077)
    env = environment()
    head = command(['git', '-C', str(REPO), 'rev-parse', 'origin/master'], env).decode().strip()
    if head != '6b9e9754d17269a965f81911ed4b0fe948b6205a':
        raise RuntimeError('Merged migration baseline moved; review before capture')
    manifest = {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted((REPO / 'packages/database/prisma/migrations').glob('*/migration.sql'))}
    preflight = json.loads(sql("SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'projects',(SELECT count(*) FROM projects),'buckets',(SELECT count(*) FROM storage.buckets),'objects',(SELECT count(*) FROM storage.objects),'vault_secrets',(SELECT count(*) FROM vault.secrets),'history',(SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM _prisma_migrations))", env))
    if preflight['users'] != 1 or preflight['projects'] != 1 or preflight['buckets'] or preflight['objects'] or preflight['vault_secrets']:
        raise RuntimeError('Approved source inventory changed or secret-recovery dependency found; stop before export')
    if len(manifest) != 12 or len(preflight['history']) != 3 or any(
            manifest.get(m['name']) != m['checksum'] or not m['finished'] or m['rolled_back']
            for m in preflight['history']):
        raise RuntimeError('Migration baseline mismatch')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    destination = ROOT / ('capture-' + stamp)
    destination.mkdir(mode=0o700)
    started = time.monotonic()
    holder = subprocess.Popen([str(PG / 'psql'), SOURCE, '-w', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
                              env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        holder.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n')
        holder.stdin.flush()
        snapshot = holder.stdout.readline().strip()
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+', snapshot):
            raise RuntimeError('Consistent source snapshot unavailable')
        dump = [str(PG / 'pg_dump'), '--dbname=' + SOURCE, '--no-password', '--snapshot=' + snapshot, '--lock-wait-timeout=15000']
        encrypted(dump + ['--format=custom', '--schema=public', '--schema=atlas_private'], destination / 'application.dump.age', env)
        encrypted(dump + ['--format=custom', '--data-only', '--schema=auth', '--schema=storage',
                  '--exclude-table-data=auth.schema_migrations', '--exclude-table-data=storage.migrations',
                  '--exclude-table-data=storage.buckets_vectors', '--exclude-table-data=storage.vector_indexes'],
                  destination / 'managed-data.dump.age', env)
        encrypted(dump + ['--schema-only', '--schema=auth', '--schema=storage'], destination / 'managed-schema-reference.sql.age', env)
        encrypted(dump + ['--format=custom', '--data-only', '--table=auth.schema_migrations', '--table=storage.migrations'],
                  destination / 'managed-bootstrap-reference.dump.age', env)
        encrypted([str(PG / 'psql'), SOURCE, '-w', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
                   '-v', 'atlas_snapshot=' + snapshot, '-f', str(REPO / 'ops/sql/a01-recovery-baseline.psql')],
                  destination / 'source-baseline.jsonl.age', env)
        # Role attributes/membership/ACL references are in the baseline. Export
        # all role names/flags separately WITHOUT passwords or secret-bearing
        # role GUCs; never blindly replay pg_dumpall role settings.
        role_query = "SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,'bypassrls',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole,'replication',rolreplication) ORDER BY rolname) FROM pg_roles"
        encrypted([str(PG / 'psql'), SOURCE, '-w', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', role_query],
                  destination / 'roles-reference.json.age', env)
        holder.stdin.write('COMMIT;\n'); holder.stdin.close()
        holder.wait(timeout=15)
        if holder.returncode:
            raise RuntimeError('Snapshot did not close cleanly')
        post = json.loads(sql("SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'projects',(SELECT count(*) FROM projects),'buckets',(SELECT count(*) FROM storage.buckets),'objects',(SELECT count(*) FROM storage.objects))", env))
        if any(post[k] != preflight[k] for k in post):
            raise RuntimeError('Source inventory changed during capture; acceptance required')
        files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.glob('*.age')}
        receipt = {'target': 'hgngonpirctrwbckhbmy', 'merged_master': head, 'captured_at': stamp,
                   'client_tls': 'verify-full', 'source_read_only': True, 'users': 1, 'projects': 1, 'buckets': 0, 'objects': 0,
                   'migrations': manifest, 'ciphertexts': files, 'capture_seconds': round(time.monotonic() - started, 2),
                   'restore_verified': False, 'backup_retention_days': 30, 'restore_retention_days': 7,
                   'key_custody': 'macOS Keychain; not in capture directory', 'offsite_copy': False}
        (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({'capture': 'COMPLETE_ENCRYPTED', 'directory': str(destination), 'files': len(files),
                          'seconds': receipt['capture_seconds'], 'restore': 'NOT YET VERIFIED'}))
    finally:
        if holder.poll() is None:
            holder.kill(); holder.wait()


if __name__ == '__main__':
    main()
