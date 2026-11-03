"""Guarded removal of this run's disposable development records only.

Immutable research snapshots have no product deletion route. This operator-only
transaction uses LOCAL replication mode, verifies every protected public row's
content hash and all public foreign keys before committing, and never changes
schema, privileges, migration history or global trigger configuration.
"""
import argparse
import configparser
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path('/Users/berk.terekli/AtlasRecovery/2026-11-02')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    fixture = json.loads((ROOT / 'activation/g5-fixtures.json').read_text())
    actors = [str(uuid.UUID(x['id'])) for x in fixture['actors'].values()]
    orgs = [str(uuid.UUID(x)) for x in fixture['organizations']]
    projects = [str(uuid.UUID(x)) for x in fixture['projects']]
    if len(actors) != 6 or len(orgs) != 2 or len(projects) != 3:
        raise RuntimeError('Unexpected approved fixture inventory')
    run = fixture['runId']
    if not run.startswith('atlas-g5-') or not all(c.isalnum() or c == '-' for c in run):
        raise RuntimeError('Invalid run marker')
    config = configparser.ConfigParser()
    config.read(ROOT / 'pg_service.conf')
    c = config['atlas_a01_migration']
    if (c['host'] != 'aws-0-ap-northeast-2.pooler.supabase.com'
            or c['user'] != 'postgres.hgngonpirctrwbckhbmy'
            or c['dbname'] != 'postgres' or c['port'] != '5432' or c['sslmode'] != 'verify-full'):
        raise RuntimeError('Wrong development target/TLS')
    def values(items):
        return ','.join("('" + item + "'::uuid)" for item in items)
    sql = f"""
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE fixture_actors(id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE fixture_orgs(id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE fixture_projects(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fixture_actors VALUES {values(actors)};
INSERT INTO fixture_orgs VALUES {values(orgs)};
INSERT INTO fixture_projects VALUES {values(projects)};
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE id IN (SELECT id FROM fixture_actors) AND raw_app_meta_data->>'atlas_fixture_run'='{run}')<>6
 OR (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'atlas_fixture_run'='{run}')<>6 THEN RAISE EXCEPTION 'Fixture Auth marker mismatch'; END IF;
 IF (SELECT count(*) FROM organizations WHERE id IN (SELECT id FROM fixture_orgs) AND personal_owner_id IN (SELECT id FROM fixture_actors))<>2 THEN RAISE EXCEPTION 'Fixture ownership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM projects WHERE organization_id IN (SELECT id FROM fixture_orgs) AND id NOT IN (SELECT id FROM fixture_projects))
 OR (SELECT count(*) FROM projects WHERE id IN (SELECT id FROM fixture_projects) AND organization_id IN (SELECT id FROM fixture_orgs))<>3 THEN RAISE EXCEPTION 'Fixture project graph changed'; END IF;
 IF EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id IN (SELECT id FROM fixture_orgs) AND profile_id NOT IN (SELECT id FROM fixture_actors))
 OR EXISTS(SELECT 1 FROM organization_memberships WHERE profile_id IN (SELECT id FROM fixture_actors) AND organization_id NOT IN (SELECT id FROM fixture_orgs)) THEN RAISE EXCEPTION 'Nonfixture membership'; END IF;
END $$;
CREATE TEMP TABLE fixture_jobs ON COMMIT DROP AS SELECT id FROM ingestion_jobs WHERE organization_id IN (SELECT id FROM fixture_orgs);
CREATE TEMP TABLE protected_rows(name text PRIMARY KEY,predicate text,hash text) ON COMMIT DROP;
CREATE TEMP TABLE cleanup_counts(name text,removed bigint) ON COMMIT DROP;
DO $$ DECLARE t record; p text; h text; BEGIN
 FOR t IN SELECT c.table_name,array_agg(c.column_name) cols FROM information_schema.columns c JOIN pg_class pc ON pc.relname=c.table_name JOIN pg_namespace ns ON ns.oid=pc.relnamespace AND ns.nspname=c.table_schema WHERE c.table_schema='public' AND pc.relkind='r' AND c.table_name<>'rate_buckets' GROUP BY c.table_name ORDER BY c.table_name LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t.table_name);
  p:=CASE t.table_name
   WHEN 'profiles' THEN 'id IN (SELECT id FROM fixture_actors)'
   WHEN 'organizations' THEN 'id IN (SELECT id FROM fixture_orgs)'
   WHEN 'research_command_keys' THEN 'actor_id IN (SELECT id FROM fixture_actors)'
   WHEN 'external_connections' THEN 'profile_id IN (SELECT id FROM fixture_actors)'
   WHEN 'audit_events' THEN 'organization_id IN (SELECT id FROM fixture_orgs) OR actor_id IN (SELECT id FROM fixture_actors)'
   WHEN 'scan_object_cleanup' THEN 'job_id IN (SELECT id FROM fixture_jobs)'
   ELSE CASE WHEN 'organization_id'=ANY(t.cols) THEN 'organization_id IN (SELECT id FROM fixture_orgs)' ELSE 'false' END END;
  EXECUTE format('SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),''''),''UTF8'')),''hex'') FROM public.%I x WHERE NOT (%s)',t.table_name,p) INTO h;
  INSERT INTO protected_rows VALUES(t.table_name,p,h);
 END LOOP;
END $$;
SET LOCAL session_replication_role=replica;
DO $$ DECLARE t record; n bigint; BEGIN
 FOR t IN SELECT * FROM protected_rows WHERE predicate<>'false' ORDER BY name LOOP
  EXECUTE format('DELETE FROM public.%I WHERE %s',t.name,t.predicate);
  GET DIAGNOSTICS n=ROW_COUNT;
  INSERT INTO cleanup_counts VALUES(t.name,n);
 END LOOP;
END $$;
SET LOCAL session_replication_role=origin;
DO $$ DECLARE t record; h text; a record; pred text; present text; n bigint; BEGIN
 FOR t IN SELECT * FROM protected_rows LOOP
  EXECUTE format('SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),''''),''UTF8'')),''hex'') FROM public.%I x WHERE NOT (%s)',t.name,t.predicate) INTO h;
  IF h<>t.hash THEN RAISE EXCEPTION 'Protected row content changed'; END IF;
 END LOOP;
 FOR t IN SELECT c.oid,c.conrelid::regclass child,c.confrelid::regclass parent,c.conkey,c.confkey FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public' LOOP
  pred:='';present:='';
  FOR a IN SELECT ca.attname child,pa.attname parent FROM unnest(t.conkey,t.confkey) k(c,p) JOIN pg_attribute ca ON ca.attrelid=t.child AND ca.attnum=k.c JOIN pg_attribute pa ON pa.attrelid=t.parent AND pa.attnum=k.p LOOP
   pred:=pred||CASE WHEN pred='' THEN '' ELSE ' AND ' END||format('p.%I=c.%I',a.parent,a.child);
   present:=present||CASE WHEN present='' THEN '' ELSE ' AND ' END||format('c.%I IS NOT NULL',a.child);
  END LOOP;
  EXECUTE format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS(SELECT 1 FROM %s p WHERE %s)',t.child,present,t.parent,pred) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Post-cleanup FK violation'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM profiles WHERE id IN (SELECT id FROM fixture_actors)) OR EXISTS(SELECT 1 FROM projects WHERE id IN (SELECT id FROM fixture_projects)) THEN RAISE EXCEPTION 'Fixture cleanup incomplete'; END IF;
END $$;
SELECT json_build_object('public_fixture_cleanup','PASS','protected_tables',(SELECT count(*) FROM protected_rows),'rows_removed',(SELECT sum(removed) FROM cleanup_counts),'remaining_projects',(SELECT count(*) FROM projects),'remaining_profiles',(SELECT count(*) FROM profiles));
COMMIT;
"""
    sql = sql.replace('WHERE NOT (%s)', 'WHERE NOT coalesce((%s),false)')
    if not args.execute:
        sql = sql.replace('\nCOMMIT;\n', '\nROLLBACK;\n')
    env = {**os.environ, 'PGSERVICEFILE': str(ROOT/'pg_service.conf'), 'PGPASSFILE': str(ROOT/'pgpass')}
    result = subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql','service=atlas_a01_migration','-XqAt','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,env=env,timeout=90)
    if result.returncode:
        # Only our static exception text, never row context/provider diagnostics.
        known = ['Fixture Auth marker mismatch','Fixture ownership mismatch','Fixture project graph changed','Nonfixture membership','Protected row content changed','Post-cleanup FK violation','Fixture cleanup incomplete']
        reason = next((x for x in known if x in result.stderr), 'SQL execution failed; transaction rolled back, details withheld')
        raise RuntimeError(reason)
    report = json.loads(result.stdout.strip())
    report['mode'] = 'COMMITTED' if args.execute else 'REHEARSED_AND_ROLLED_BACK'
    (ROOT/('activation/g5-public-cleanup.json' if args.execute else 'activation/g5-cleanup-rehearsal.json')).write_text(json.dumps(report,indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
