"""Start only the approved loopback recovery services and live Atlas web server."""
import json,os,secrets,subprocess
from pathlib import Path
from urllib.parse import quote
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02')
c=json.loads((R/'restore-config.json').read_text());e=os.environ.copy();e['PGPASSWORD']=c['migrator']
p=['/opt/homebrew/opt/postgresql@17/bin/psql','host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable','-X','-q','-v','ON_ERROR_STOP=1']
# Exact source Auth hashes have passed. Invalidate only cloned session material
# before restarting isolated Auth with its independent signing secret.
sql='BEGIN; DELETE FROM auth.refresh_tokens; DELETE FROM auth.sessions; DELETE FROM auth.one_time_tokens; DELETE FROM auth.flow_state; COMMIT;'
v=subprocess.run(p,input=sql.encode(),env=e,capture_output=True)
if v.returncode:raise RuntimeError('Destination session sanitization failed; details withheld')
subprocess.run(['docker-compose','-f',str(R/'restore-compose.yml'),'start','auth','storage'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['docker-compose','-f',str(R/'restore-compose.yml'),'exec','-T','gateway','nginx','-s','reload'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
e.update(ATLAS_MODE='live',ATLAS_ORIGIN='http://127.0.0.1:3105',NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54322',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=c['anon_key'],DATABASE_URL='postgresql://atlas_auth_runtime:'+quote(c['runtime'],safe='')+'@127.0.0.1:55434/atlas_auth_test?schema=public',ATLAS_RATE_SECRET=secrets.token_urlsafe(48),ATLAS_CURSOR_SECRET=secrets.token_urlsafe(48),NEXT_TELEMETRY_DISABLED='1')
for k in ['DIRECT_URL','OPENAI_API_KEY','ANTHROPIC_API_KEY','ATLAS_AI_ACTIVATION','ATLAS_AI_PAID_REQUESTS']:e.pop(k,None)
with open(R/'web-acceptance.log','ab') as f:
 os.chmod(R/'web-acceptance.log',0o600)
 q=subprocess.Popen(['pnpm','--filter','@atlas/web','dev','--port','3105'],env=e,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
(R/'web-acceptance.pid').write_text(str(q.pid));(R/'web-acceptance.pid').chmod(0o600)
print(json.dumps({'cloned_sessions':'INVALIDATED','destination_auth_storage':'STARTED','local_web_pid':q.pid,'ai':'DISABLED'}))
