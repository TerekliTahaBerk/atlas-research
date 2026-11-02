"""Build a fresh local rehearsal DB; never reset or repair migration history."""
import json,os,subprocess
from pathlib import Path
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1];PG=Path('/opt/homebrew/opt/postgresql@17/bin');c=json.loads((R/'restore-config.json').read_text());e=os.environ.copy();e['PGPASSWORD']=c['migrator']
base='host=127.0.0.1 port=55434 user=supabase_admin sslmode=disable dbname='
def run(args,data=None):
 q=subprocess.run(args,input=data,env=e,capture_output=True)
 if q.returncode:raise RuntimeError('Local rehearsal copy command failed; private diagnostic withheld')
 return q.stdout
def sql(db,s):return run([str(PG/'psql'),base+db,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],s.encode() if isinstance(s,str) else s)
assert sql('atlas_auth_test',"SELECT to_regclass('public.project_papers') IS NULL").strip()==b't'
# Source public schema owner/privileges were checked independently; fresh
# database ownership must match, rather than retaining vendor template owner.
sql('atlas_auth_test','ALTER SCHEMA public OWNER TO postgres;')
schema=run([str(PG/'pg_dump'),base+'atlas_auth_test','--schema-only','--no-publications','--no-subscriptions'])
name='atlas_g3_rehearsal'
sql('postgres','CREATE DATABASE '+name+' OWNER postgres;')
# pg_dump handles public's existing template schema with its standard owner
# ALTER and ACL statements; omit only duplicate CREATE SCHEMA public.
schema=schema.replace(b'CREATE SCHEMA public;',b'-- public already supplied by the database template;')
sql(name,schema)
i=run([str(R/'keychain-helper'),'get'])
def decrypt(n):return run(['age','-d','-i','-',str(D/n)],i)
app=run([str(PG/'pg_restore'),'--data-only','--file=-'],decrypt('application.dump.age'))
managed=run([str(PG/'pg_restore'),'--data-only','--file=-'],decrypt('managed-data.dump.age'))
sql(name,b'BEGIN; SET LOCAL session_replication_role=replica;\n'+managed+app+b'\nCOMMIT;')
assert sql(name,'SELECT count(*) FROM public._prisma_migrations').strip()==b'3'
print(json.dumps({'fresh_local_rehearsal':name,'source_history_rows':3,'source_connection_used':False,'original_restore_preserved':True}))
