"""Rehearse the pinned migration batch only on the approved local restore."""
import hashlib,json,os,secrets,subprocess,time
from pathlib import Path
from urllib.parse import quote
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1];repo=Path(__file__).resolve().parents[2]
r=json.loads((D/'receipt.json').read_text());assert r['restore_verified']
manifest={p.parent.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((repo/'packages/database/prisma/migrations').glob('*/migration.sql'))};assert manifest==r['migrations']
c=json.loads((R/'restore-config.json').read_text());e=os.environ.copy();e['PGPASSWORD']=c['migrator']
p=['/opt/homebrew/opt/postgresql@17/bin/psql','host=127.0.0.1 port=55434 dbname=atlas_g3_rehearsal user=supabase_admin sslmode=disable','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def sql(s):
 q=subprocess.run(p,input=s.encode(),env=e,capture_output=True)
 if q.returncode:raise RuntimeError('Local rehearsal SQL failed; details withheld')
 return q.stdout
# Separate destination owner login, never source credentials.
c['rehearsal_owner']=secrets.token_urlsafe(48);sql("ALTER ROLE postgres PASSWORD '"+c['rehearsal_owner']+"';")
(R/'restore-config.json').write_text(json.dumps(c));(R/'restore-config.json').chmod(0o600)
e['DIRECT_URL']='postgresql://postgres:'+quote(c['rehearsal_owner'],safe='')+'@127.0.0.1:55434/atlas_g3_rehearsal?schema=public&sslmode=disable';e.pop('DATABASE_URL',None)
start=time.monotonic();results=[]
for operation in ['status','deploy','status','deploy']:
 q=subprocess.run(['pnpm','exec','prisma','migrate',operation],cwd=repo/'packages/database',env=e,capture_output=True)
 # Initial status exits 1 when pending migrations are detected.
 if q.returncode and not (operation=='status' and not results and q.returncode==1):
  diagnostic=(q.stdout+q.stderr).replace(e['DIRECT_URL'].encode(),b'[REDACTED]').replace(c['rehearsal_owner'].encode(),b'[REDACTED]')
  subprocess.run(['age','-R',str(R/'recipients.txt'),'-o',str(D/'rehearsal-failure.age')],input=diagnostic,capture_output=True,check=True)
  raise RuntimeError('Local Prisma '+operation+' failed; encrypted diagnostic retained')
 results.append({'operation':operation,'exit':q.returncode})
h=json.loads(sql('SELECT json_agg(json_build_object(\'name\',migration_name,\'checksum\',checksum,\'finished\',finished_at IS NOT NULL,\'rolled_back\',rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM public._prisma_migrations'))
assert len(h)==12 and all(manifest[x['name']]==x['checksum'] and x['finished'] and not x['rolled_back'] for x in h)
result={'target':'127.0.0.1:55434/atlas_g3_rehearsal','owner':'postgres','operations':results,'migrations':12,'exact_checksums':True,'seconds':round(time.monotonic()-start,2)}
(D/'migration-rehearsal.json').write_text(json.dumps(result,indent=2)+'\n');(D/'migration-rehearsal.json').chmod(0o600)
print(json.dumps(result))
