"""Execute only the user's pinned G3 approval, with normal Prisma deployment.
No reset, resolve, history edits, source credential rotation or paid AI calls.
"""
import configparser,hashlib,json,os,subprocess,time
from pathlib import Path
from urllib.parse import quote,urlencode
from datetime import datetime,timezone
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1];REPO=Path(__file__).resolve().parents[2];PG=Path('/opt/homebrew/opt/postgresql@17/bin')
r=json.loads((D/'receipt.json').read_text());approval=json.loads((R/'g3-approval.json').read_text());rehearsal=json.loads((D/'migration-rehearsal.json').read_text())
assert approval['approved'] and approval['target']==r['target']=='hgngonpirctrwbckhbmy'
assert approval['master']==r['merged_master']=='6b9e9754d17269a965f81911ed4b0fe948b6205a' and r['restore_verified']
assert rehearsal['migrations']==12 and rehearsal['exact_checksums']
manifest={p.parent.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((REPO/'packages/database/prisma/migrations').glob('*/migration.sql'))}
assert manifest==r['migrations'] and len(manifest)==12
assert not (REPO/'.env').exists() and not (REPO/'apps/web/.env.local').exists()
c=configparser.ConfigParser();c.read(R/'pg_service.conf');s=c['atlas_a01_migration']
assert s['host']=='aws-0-ap-northeast-2.pooler.supabase.com' and s['port']=='5432' and s['user']=='postgres.hgngonpirctrwbckhbmy' and s['dbname']=='postgres' and s['sslmode']=='verify-full'
# Parse pgpass escaping without printing or placing credentials in argv/files.
def fields(line):
 result=[];item='';escaped=False
 for ch in line.rstrip('\n'):
  if escaped:item+=ch;escaped=False
  elif ch=='\\':escaped=True
  elif ch==':':result.append(item);item=''
  else:item+=ch
 return result+[item]
entries=[fields(x) for x in (R/'pgpass').read_text().splitlines() if x and not x.startswith('#')]
password=next(x[4] for x in entries if len(x)==5 and x[:4]==[s['host'],s['port'],s['dbname'],s['user']])
e={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'LC_ALL':'C','PGSERVICEFILE':str(R/'pg_service.conf'),'PGPASSFILE':str(R/'pgpass'),'PGCONNECT_TIMEOUT':'20'}
E=D/('g3-attempt-'+str(time.time_ns()));E.mkdir(mode=0o700)
def seal(name,data):
 p=E/name;v=subprocess.run(['age','-R',str(R/'recipients.txt'),'-o',str(p)],input=data,capture_output=True)
 if v.returncode:raise RuntimeError('Evidence encryption failed')
 p.chmod(0o600);return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,data=None,env=None,allow_pending=False):
 q=subprocess.run(args,input=data,env=env or e,capture_output=True,cwd=REPO/'packages/database' if args[0]=='pnpm' else REPO)
 if q.returncode and not (allow_pending and q.returncode==1):
  seal('g3-failure-'+str(time.time_ns())+'.age',q.stdout+q.stderr)
  raise RuntimeError('G3 stopped: '+Path(args[0]).name+' failed; encrypted diagnostic retained; no automatic repair')
 return q
def sql(statement):
 env={**e,'PGOPTIONS':'-c default_transaction_read_only=on'}
 return run([str(PG/'psql'),'service=atlas_a01_migration','-w','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],statement.encode(),env).stdout
identity=json.loads(sql("BEGIN READ ONLY; SELECT json_build_object('user',current_user,'session',session_user,'db',current_database(),'vector_available',EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector')); COMMIT;"))
assert identity=={'user':'postgres','session':'postgres','db':'postgres','vector_available':True}
sql((REPO/'ops/sql/a01-migration-history-gate.sql').read_text())
h=json.loads(sql("SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM public._prisma_migrations"))
assert len(h)==3 and all(manifest[x['name']]==x['checksum'] and x['finished'] and not x['rolled_back'] for x in h)
baseline=(REPO/'ops/sql/a01-recovery-baseline.psql').read_text();before=sql(baseline);evidence={'before':seal('g3-before-baseline.jsonl.age',before)}
# Prisma migration engine uses its documented strict certificate options;
# native libpq owner preflight above independently uses verify-full.
url='postgresql://'+quote(s['user'],safe='')+':'+quote(password,safe='')+'@'+s['host']+':5432/postgres?'+urlencode({'schema':'public','sslmode':'require','sslcert':str(R/'supabase-ca.crt'),'sslaccept':'strict','connect_timeout':'20'})
prisma_env={**e,'DIRECT_URL':url,'NODE_EXTRA_CA_CERTS':str(R/'supabase-ca.crt')};operations=[];started=time.monotonic()
# Linux OpenSSL handles the official Supabase trust anchor reliably; macOS
# native TLS rejected it. Credentials enter only through an owner-only file.
container_url=url.replace(quote(str(R/'supabase-ca.crt'),safe=''),quote('/opt/atlas/supabase-ca.crt',safe=''))
env_file=R/'g3-linux.env';env_file.write_text('DIRECT_URL='+container_url+'\nPRISMA_SCHEMA_ENGINE_BINARY=/opt/atlas/schema-engine\nNODE_EXTRA_CA_CERTS=/opt/atlas/supabase-ca.crt\nJITI_CACHE_DIR=/tmp/jiti\n');env_file.chmod(0o600)
def prisma_args(operation):
 return ['docker','run','--rm','--read-only','--user',str(os.getuid())+':'+str(os.getgid()),'--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','768m','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--env-file',str(env_file),'-v',str(REPO)+':/workspace:ro','-v',str(R/'linux-schema-engine')+':/opt/atlas/schema-engine:ro','-v',str(R/'supabase-ca.crt')+':/opt/atlas/supabase-ca.crt:ro','-w','/workspace/packages/database','atlas-prisma-migration:7.10.1','node','node_modules/prisma/build/index.js','migrate',operation]

for index,operation in enumerate(['status','deploy','status','deploy']):
 q=run(prisma_args(operation),allow_pending=index==0)
 evidence['prisma_'+str(index)]=seal('g3-prisma-'+str(index)+'.age',q.stdout+q.stderr)
 if index==0:
  pending=[name for name in manifest if name not in {x['name'] for x in h}]
  assert len(pending)==9 and all(name.encode() in q.stdout+q.stderr for name in pending),'Prisma status did not identify the exact pending batch'
 operations.append({'operation':operation,'exit':q.returncode})
 print(json.dumps({'G3_operation':operation,'exit':q.returncode,'step':index+1}),flush=True)
after=sql(baseline);evidence['after']=seal('g3-after-baseline.jsonl.age',after)
b=[json.loads(x) for x in before.splitlines()];a=[json.loads(x) for x in after.splitlines()]
original={(x['schema'],x['table']):x for x in b if x['kind']=='table' and x['schema'] in ('public','atlas_private') and x['table']!='_prisma_migrations'}
actual={(x['schema'],x['table']):x for x in a if x['kind']=='table'}
assert all(value==actual.get(key) for key,value in original.items()),'Existing application content changed'
h=next(x['items'] for x in a if x['kind']=='prisma_history');assert len(h)==12 and all(manifest[x['name']]==x['checksum'] and x['finished'] and not x['rolled_back'] for x in h)
sql((REPO/'ops/sql/a01-migration-history-gate.sql').read_text())
for name in ['a01-hosted-g1-verification.sql','phase-02-security-audit.sql','phase-03-verification.sql']:
 evidence[name]=seal('g3-'+name+'.age',sql((REPO/'ops/sql'/name).read_text()))
# Assert, rather than merely list, critical post-deployment security findings.
audit=json.loads(sql("""SELECT json_build_object('no_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),'browser_tables',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname IN ('anon','authenticated') AND c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))),'browser_private_functions',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_proc p WHERE r.rolname IN ('anon','authenticated') AND p.pronamespace='atlas_private'::regnamespace AND has_function_privilege(r.oid,p.oid,'EXECUTE')),'web_worker_membership',pg_has_role('atlas_runtime','atlas_ai_worker','MEMBER'),'worker_table_access',(SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND has_table_privilege('atlas_ai_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'vector',(SELECT extversion FROM pg_extension WHERE extname='vector'))"""))
assert all(not audit[x] for x in ['no_rls','browser_tables','browser_private_functions','web_worker_membership','worker_table_access']) and audit['vector']
result={'G3':'PASS','target':r['target'],'master':r['merged_master'],'accepted_at':datetime.now(timezone.utc).isoformat(),'operations':operations,'migrations':12,'exact_checksums':True,'preserved_original_application_tables':len(original),'security':audit,'client_tls':'verify-full native; Prisma require+sslaccept=strict+approved CA','route':'Supabase session pooler 5432; direct IPv6 timed out before writes','seconds':round(time.monotonic()-started,2),'evidence_ciphertext_sha256':evidence}
(R/'g3-result.json').write_text(json.dumps(result,indent=2)+'\n');(R/'g3-result.json').chmod(0o600)
print(json.dumps(result))
