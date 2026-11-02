"""Restore the approved Atlas capture into the isolated local target only.
All decrypted archives/data stay in memory/pipes. No source connection is used.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = Path('/Users/berk.terekli/AtlasRecovery/2026-11-02')
REPO = Path(__file__).resolve().parents[2]
PG = Path('/opt/homebrew/opt/postgresql@17/bin')
CONNECTION = 'host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable'


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def main():
    os.umask(0o077)
    started = time.monotonic()
    directory = sorted(ROOT.glob('capture-*'))[-1]
    receipt = json.loads((directory / 'receipt.json').read_text())
    if receipt['target'] != 'hgngonpirctrwbckhbmy' or receipt['restore_verified']:
        raise RuntimeError('Wrong source or already accepted restore; refusing replacement')
    configuration = json.loads((ROOT / 'restore-config.json').read_text())
    env = {'PATH': os.environ['PATH'], 'PGPASSWORD': configuration['migrator'], 'PGCONNECT_TIMEOUT': '10', 'LC_ALL': 'C'}
    identity = subprocess.run([str(ROOT / 'keychain-helper'), 'get'], capture_output=True, check=True).stdout

    def run(args, content=None):
        result = subprocess.run(args, input=content, env=env, capture_output=True)
        if result.returncode:
            # Keep detailed diagnostics encrypted, never source rows/passwords in logs.
            failure = directory / ('restore-failure-' + str(time.time_ns()) + '.age')
            subprocess.run(['age', '-R', str(ROOT / 'recipients.txt'), '-o', str(failure)], input=result.stderr, capture_output=True, check=True)
            line = next((x for x in result.stderr.decode(errors='replace').splitlines() if 'ERROR:' in x), 'command failed')
            line = re.sub(r"'[^']*'", "'[redacted]'", line)
            raise RuntimeError(f'{Path(args[0]).name}: {line[:250]}; encrypted diagnostic {failure.name}')
        return result.stdout

    def sql(statement):
        if '127.0.0.1 port=55434' not in CONNECTION:
            raise RuntimeError('Destination boundary')
        return run([str(PG / 'psql'), CONNECTION, '-w', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
                   statement.encode() if isinstance(statement, str) else statement)

    def decrypt(name):
        path = directory / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != receipt['ciphertexts'][name]:
            raise RuntimeError('Ciphertext integrity mismatch')
        return subprocess.run(['age', '-d', '-i', '-', str(path)], input=identity, capture_output=True, check=True).stdout

    def encrypt(name, content):
        path = directory / name
        run(['age', '-R', str(ROOT / 'recipients.txt'), '-o', str(path)], content)
        path.chmod(0o600)

    source = [json.loads(line) for line in decrypt('source-baseline.jsonl.age').splitlines()]
    roles = json.loads(decrypt('roles-reference.json.age'))
    section = lambda name: next(x for x in source if x['kind'] == name)['items']
    app = decrypt('application.dump.age')
    managed = decrypt('managed-data.dump.age')
    schema = decrypt('managed-schema-reference.sql.age').decode()
    if '--verify-existing' not in sys.argv:
        existing = json.loads(sql("SELECT coalesce(json_agg(rolname),'[]') FROM pg_roles"))
        # Same official PG17 bootstrap supplies managed roles. Only original Atlas
        # custom roles are created; passwords are destination-specific, never copied.
        role_passwords = {}
        for role in roles:
            name = role['name']
            if name in existing:
                continue
            if not name.startswith('atlas_') and name != 'supabase_realtime_admin':
                raise RuntimeError('Missing managed role: ' + name)
            if name == 'supabase_realtime_admin' and any(role[key] for key in ('login', 'inherit', 'superuser', 'bypassrls', 'createdb', 'createrole', 'replication')):
                raise RuntimeError('Unexpected source Realtime role privileges')
            flags = [('LOGIN', 'NOLOGIN', 'login'), ('INHERIT', 'NOINHERIT', 'inherit'),
                     ('SUPERUSER', 'NOSUPERUSER', 'superuser'), ('BYPASSRLS', 'NOBYPASSRLS', 'bypassrls'),
                     ('CREATEDB', 'NOCREATEDB', 'createdb'), ('CREATEROLE', 'NOCREATEROLE', 'createrole'),
                     ('REPLICATION', 'NOREPLICATION', 'replication')]
            options = ' '.join(yes if role[key] else no for yes, no, key in flags)
            password = ''
            if role['login']:
                role_passwords[name] = secrets.token_urlsafe(48)
                password = " PASSWORD '" + role_passwords[name] + "'"
            sql('CREATE ROLE ' + identifier(name) + ' ' + options + password + ';')
        configuration['restored_role_passwords'] = role_passwords
        (ROOT / 'restore-config.json').write_text(json.dumps(configuration))
        (ROOT / 'restore-config.json').chmod(0o600)
        # Stop services before data load, preventing background Auth mutations until
        # exact hashes are compared. The separate loopback proxy stays running.
        run(['docker-compose', '-f', str(ROOT / 'restore-compose.yml'), 'stop', 'auth', 'storage'])
        toc = run([str(PG / 'pg_restore'), '--list'], app).decode()
        toc = '\n'.join(line for line in toc.splitlines() if ' SCHEMA - public ' not in line) + '\n'
        toc_path = ROOT / 'application.toc'; toc_path.write_text(toc); toc_path.chmod(0o600)
        def render(data, *args):
            return run([str(PG / 'pg_restore'), '--exit-on-error', '--file=-', *args], data)
        sql(render(app, '--use-list=' + str(toc_path), '--section=pre-data'))
        # Compatibility patch for a platform-managed Storage unlock absent from
        # public API bootstrap 1.79.32. Original history is retained as reference;
        # no managed/Prisma history row is fabricated or overwritten.
        transition = re.search(r'CREATE FUNCTION storage\.enforce_versioning_status_transition\(\).*?\n\$\$;', schema, re.S)
        trigger = next((line for line in schema.splitlines() if line.startswith('CREATE TRIGGER ') and 'enforce_versioning_status_transition' in line), None)
        function = next(x for x in section('functions') if x['schema'] == 'storage' and x['name'] == 'enforce_versioning_status_transition')
        if not transition or not trigger:
            raise RuntimeError('Expected source Storage transition metadata absent')
        sql('ALTER TABLE storage.buckets DROP CONSTRAINT IF EXISTS buckets_versioning_dark_check;\n' + transition.group() + '\nALTER FUNCTION storage.enforce_versioning_status_transition() OWNER TO ' + identifier(function['owner']) + ';\n' + trigger)
        sql(b'BEGIN; SET LOCAL session_replication_role=replica;\n' + render(managed, '--data-only') + b'\nCOMMIT;')
        sql(render(app, '--use-list=' + str(toc_path), '--section=data'))
        sql(render(app, '--use-list=' + str(toc_path), '--section=post-data'))
        for member in section('role_memberships') or []:
            if member['member'].startswith('atlas_'):
                if member['admin'] or not member['inherit'] or not member['set']:
                    raise RuntimeError('Unexpected custom role membership options')
                sql('GRANT ' + identifier(member['role']) + ' TO ' + identifier(member['member']) + ';')
        sql('GRANT atlas_runtime TO atlas_auth_runtime;')
    # Align only this disposable target's bootstrap ACLs with captured source.
    previous = directory / 'destination-baseline.jsonl.age'
    if previous.exists():
        old = subprocess.run(['age', '-d', '-i', '-', str(previous)], input=identity, capture_output=True, check=True).stdout
        previous_sections = [json.loads(line) for line in old.splitlines()]
        target_section = lambda name: next(x for x in previous_sections if x['kind'] == name)['items'] or []
        canon = lambda items: {json.dumps(x, sort_keys=True): x for x in items or []}
        desired = canon(section('relation_acl'))
        current = canon(target_section('relation_acl'))
        original_objects = {(x['schema'], x['object']) for x in desired.values()}
        for key, grant in current.items():
            if key in desired or (grant['schema'], grant['object']) not in original_objects:
                continue
            objtype = 'SEQUENCE' if grant['object_kind'] == 'S' else 'TABLE'
            grantee = 'PUBLIC' if grant['grantee'] == 'PUBLIC' else identifier(grant['grantee'])
            sql('SET ROLE ' + identifier(grant['grantor']) + '; REVOKE ' + grant['privilege'] + ' ON ' + objtype + ' ' + identifier(grant['schema']) + '.' + identifier(grant['object']) + ' FROM ' + grantee + '; RESET ROLE;')
        for key, grant in desired.items():
            if key in current:
                continue
            objtype = 'SEQUENCE' if grant['object_kind'] == 'S' else 'TABLE'
            grantee = 'PUBLIC' if grant['grantee'] == 'PUBLIC' else identifier(grant['grantee'])
            sql('SET ROLE ' + identifier(grant['grantor']) + '; GRANT ' + grant['privilege'] + ' ON ' + objtype + ' ' + identifier(grant['schema']) + '.' + identifier(grant['object']) + ' TO ' + grantee + (' WITH GRANT OPTION' if grant['grantable'] else '') + '; RESET ROLE;')
        expected_defaults = canon(section('default_acl'))
        for key, grant in canon(target_section('default_acl')).items():
            if key in expected_defaults:
                continue
            if grant['creator'] != 'postgres' or grant['schema'] != 'public' or grant['grantee'] not in ('anon', 'authenticated') or grant['object_kind'] not in ('r', 'S'):
                raise RuntimeError('Unreviewed destination default grant')
            sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ' + grant['privilege'] + ' ON ' + ('TABLES' if grant['object_kind'] == 'r' else 'SEQUENCES') + ' FROM ' + identifier(grant['grantee']) + ';')
    baseline = sql("SET search_path=pg_catalog,public;\n" + (REPO / 'ops/sql/a01-recovery-baseline.psql').read_text())
    encrypt('destination-baseline-verified-' + str(time.time_ns()) + '.jsonl.age', baseline)
    target = [json.loads(line) for line in baseline.splitlines()]
    source_tables = {(x['schema'], x['table']): x for x in source if x['kind'] == 'table'}
    target_tables = {(x['schema'], x['table']): x for x in target if x['kind'] == 'table'}
    exempt = {('auth', 'schema_migrations'), ('storage', 'migrations')}
    mismatches = [key for key, item in source_tables.items() if key not in exempt and item != target_tables.get(key)]
    if mismatches:
        raise RuntimeError('Restored source content mismatch in: ' + ', '.join('.'.join(k) for k in mismatches))
    extras = set(target_tables) - set(source_tables)
    if any(k[0] != 'storage' or not k[1].startswith('iceberg_') or target_tables[k]['rows'] != 0 for k in extras):
        raise RuntimeError('Unexpected extra destination table/data')
    # No direct browser access to destination-only managed metadata tables.
    for schema_name, table in extras:
        sql('REVOKE ALL ON ' + identifier(schema_name) + '.' + identifier(table) + ' FROM anon,authenticated;')
    source_history = section('prisma_history')
    target_history = next(x for x in target if x['kind'] == 'prisma_history')['items']
    if source_history != target_history:
        raise RuntimeError('Prisma migration history mismatch')
    # Compare every original constraint (same canonical search_path) and function.
    by_constraint = lambda items: {(x['schema'], x['table'], x['name']): x for x in items or []}
    sc = by_constraint(section('constraints'))
    tc = by_constraint(next(x for x in target if x['kind'] == 'constraints')['items'])
    changed = [key for key in sc if sc[key] != tc.get(key)]
    for key in list(changed):
        before, after = sc[key], tc.get(key)
        if before['type'] != 'c' or not after or {k:v for k,v in before.items() if k != 'definition'} != {k:v for k,v in after.items() if k != 'definition'}:
            continue
        # Same archived CHECK expression is reparsed in an empty temporary copy.
        # Accept only its exact server-rendered match, preserving every predicate.
        rendered = sql('BEGIN; CREATE TEMP TABLE atlas_constraint_roundtrip (LIKE ' + identifier(before['schema']) + '.' + identifier(before['table']) + '); ALTER TABLE atlas_constraint_roundtrip ADD CONSTRAINT roundtrip ' + before['definition'] + "; SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='pg_temp.atlas_constraint_roundtrip'::regclass AND conname='roundtrip'; ROLLBACK;").decode().strip()
        if rendered == after['definition']:
            changed.remove(key)
    if changed:
        print(json.dumps({'constraint_metadata_differences': changed}))
        raise RuntimeError('Review constraint round-trip definitions before acceptance')
    by_function = lambda items: {(x['schema'], x['name'], x['arguments']): x for x in items or []}
    sf = by_function(section('functions'))
    tf = by_function(next(x for x in target if x['kind'] == 'functions')['items'])
    changed = [key for key in sf if sf[key] != tf.get(key)]
    if changed:
        print(json.dumps({'function_metadata_differences': changed}))
        raise RuntimeError('Function/security metadata mismatch')
    for kind in ('relations', 'policies', 'column_acl', 'relation_acl', 'default_acl', 'extensions', 'role_attributes'):
        before = section(kind) or []
        after = next(x for x in target if x['kind'] == kind)['items'] or []
        canonical = lambda values: {json.dumps(x, sort_keys=True) for x in values}
        expected, actual = canonical(before), canonical(after)
        extra = [json.loads(x) for x in actual - expected]
        allowed = (kind == 'relations' and all((x['schema'], x['table']) in extras for x in extra)) or (kind == 'role_attributes' and all(x['name'] == 'atlas_auth_runtime' and not any(x[k] for k in ('superuser','bypassrls','createdb','createrole','replication')) for x in extra)) or (kind == 'relation_acl' and all((x['schema'], x['object']) in extras for x in extra))
        if expected - actual or (extra and not allowed):
            raise RuntimeError('Security metadata mismatch: ' + kind)
    # Every FK is probed, including already validated and replica-loaded rows.
    fks = json.loads(sql("SELECT json_agg(json_build_object('name',c.conname,'child_schema',cn.nspname,'child',cl.relname,'parent_schema',pn.nspname,'parent',pl.relname,'match',c.confmatchtype,'child_columns',(SELECT json_agg(a.attname ORDER BY k.i) FROM generate_subscripts(c.conkey,1) k(i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[k.i]),'parent_columns',(SELECT json_agg(a.attname ORDER BY k.i) FROM generate_subscripts(c.confkey,1) k(i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=c.confkey[k.i]))) FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=cl.relnamespace JOIN pg_class pl ON pl.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pl.relnamespace WHERE c.contype='f' AND cn.nspname IN ('public','atlas_private','auth','storage')"))
    for fk in fks:
        if fk['match'] != 's': raise RuntimeError('Unsupported FK match')
        child = identifier(fk['child_schema']) + '.' + identifier(fk['child'])
        parent = identifier(fk['parent_schema']) + '.' + identifier(fk['parent'])
        nonnull = ' AND '.join('c.' + identifier(x) + ' IS NOT NULL' for x in fk['child_columns'])
        equal = ' AND '.join('c.' + identifier(a) + '=p.' + identifier(b) for a, b in zip(fk['child_columns'], fk['parent_columns']))
        if int(sql(f'SELECT count(*) FROM {child} c WHERE {nonnull} AND NOT EXISTS(SELECT 1 FROM {parent} p WHERE {equal})')):
            raise RuntimeError('Restored FK orphan: ' + fk['name'])
    receipt['restored_source_tables_verified'] = len(source_tables) - len(exempt)
    receipt['foreign_keys_verified'] = len(fks)
    receipt['destination_only_empty_tables'] = sorted('.'.join(k) for k in extras)
    receipt['restore_database_verified'] = True
    receipt['restore_database_seconds'] = round(time.monotonic() - started, 2)
    receipt['restore_verified'] = False  # Auth/application/isolation acceptance still required.
    receipt['verified_at'] = datetime.now(timezone.utc).isoformat()
    (directory / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'database_restore': 'PASS', 'tables': len(source_tables) - len(exempt), 'prisma_history': 'MATCH', 'foreign_keys': len(fks), 'application_acceptance': 'PENDING'}))


if __name__ == '__main__':
    main()
