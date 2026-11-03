"""Actual HTTP/Auth acceptance on the approved isolated restore only."""
import json,os,re,secrets,subprocess,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1]
c=json.loads((R/'restore-config.json').read_text()); e=os.environ.copy();e['PGPASSWORD']=c['migrator']
p=['/opt/homebrew/opt/postgresql@17/bin/psql','host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def sql(s):
 r=subprocess.run(p,input=s.encode(),env=e,capture_output=True)
 if r.returncode:raise RuntimeError('Local acceptance SQL failed; diagnostic withheld')
 return r.stdout.decode().strip()
def http(path,body=None,cookie=None,base='http://127.0.0.1:54322'):
 assert base in ('http://127.0.0.1:54322','http://127.0.0.1:3105')
 headers={'apikey':c['anon_key'],'Content-Type':'application/json'}
 if cookie:headers['Cookie']=cookie
 r=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
 try:
  with urllib.request.urlopen(r,timeout=90) as q:return q.status,q.read()
 except urllib.error.HTTPError as q:return q.code,q.read()
def mail_api(path):
 v=subprocess.run(['docker-compose','-f',str(R/'restore-compose.yml'),'exec','-T','gateway','wget','-qO-','http://mail:8025/api/v1/'+path],capture_output=True)
 if v.returncode:raise RuntimeError('Isolated mailbox unavailable')
 return json.loads(v.stdout)
def session_for(email,signup=False):
 if signup:status,_=http('/auth/v1/signup',{'email':email,'password':secrets.token_urlsafe(48)})
 else:status,_=http('/auth/v1/otp',{'email':email,'create_user':False})
 if status!=200:raise RuntimeError('Destination normal sign-in request failed: '+str(status))
 link=None
 for _ in range(30):
  for item in mail_api('messages')['messages']:
   if any(x['Address']==email for x in item['To']):
    mail=mail_api('message/'+item['ID']);match=re.search(r'http://127\.0\.0\.1:54322/auth/v1/verify[^\s<>"\']+', (mail.get('Text','')+' '+mail.get('HTML','')).replace('&amp;','&'))
    if match:link=match.group();break
  if link:break
  time.sleep(1)
 if not link:raise RuntimeError('No isolated confirmation mail')
 query=urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
 status,b=http('/auth/v1/verify',{'token_hash':query['token'][0],'type':query['type'][0]})
 if status!=200:raise RuntimeError('Destination provider email verification failed: '+str(status))
 session=json.loads(b)
 if not session.get('access_token') or not session.get('refresh_token'):raise RuntimeError('No normal destination session')
 q=subprocess.run(['node','ops/recovery/session-cookies.mjs'],input=json.dumps({'key':c['anon_key'],'session':{'access_token':session['access_token'],'refresh_token':session['refresh_token']}}).encode(),capture_output=True)
 if q.returncode:raise RuntimeError('Destination SSR cookie setup failed')
 return q.stdout.decode(),session['user']['id']
start=time.monotonic()
actor=json.loads(sql("SELECT json_build_object('id',id,'email',email) FROM auth.users ORDER BY created_at LIMIT 1"))
project=sql('SELECT id FROM public.projects ORDER BY created_at LIMIT 1')
cookie,uid=session_for(actor['email'])
assert uid==actor['id']
status,b=http('/api/v1/me',cookie=cookie,base='http://127.0.0.1:3105')
if status!=200:raise RuntimeError('Restored actor /me HTTP '+str(status))
me=json.loads(b)['data']
if project not in [x['id'] for x in me['projects']]:raise RuntimeError('Restored project absent from application')
status,_=http('/api/v1/projects/'+project,cookie=cookie,base='http://127.0.0.1:3105')
if status!=200:raise RuntimeError('Restored actor project read HTTP '+str(status))
other,_=session_for('recovery-outsider-'+secrets.token_hex(6)+'@atlas.example',signup=True)
outsider,_=http('/api/v1/projects/'+project,cookie=other,base='http://127.0.0.1:3105')
if outsider not in (403,404):raise RuntimeError('Outsider project denial failed: '+str(outsider))
anonymous,_=http('/api/v1/projects/'+project,base='http://127.0.0.1:3105')
if anonymous!=401:raise RuntimeError('Anonymous application denial failed')
# Runtime remains non-owner and cannot read migration history or bypass RLS.
flags=json.loads(sql("SELECT json_build_object('superuser',rolsuper,'bypassrls',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole,'history',has_table_privilege('atlas_auth_runtime','public._prisma_migrations','SELECT')) FROM pg_roles WHERE rolname='atlas_auth_runtime'"))
if any(flags.values()):raise RuntimeError('Unsafe recovery application role')
result={'restored_actor_normal_auth':'PASS','restored_workspace_project_http':'PASS','outsider_project_status':outsider,'anonymous_project_status':anonymous,'non_owner_runtime':'PASS','acceptance_seconds':round(time.monotonic()-start,2),'source_mutations':False}
(D/'application-acceptance.json').write_text(json.dumps(result,indent=2)+'\n');(D/'application-acceptance.json').chmod(0o600)
print(json.dumps(result))
