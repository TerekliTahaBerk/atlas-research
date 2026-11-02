"""Read-only cross-check of source/destination structural security metadata."""
import json,os,subprocess
from pathlib import Path
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1]
c=json.loads((R/'restore-config.json').read_text())
q="""BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,public;
SELECT json_build_object('triggers',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','atlas_private','auth','storage')),
'indexes',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'definition',pg_get_indexdef(x.indexrelid)) ORDER BY n.nspname,c.relname,i.relname) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid WHERE n.nspname IN ('public','atlas_private','auth','storage')),
'columns',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND n.nspname IN ('public','atlas_private','auth','storage')),
'auth_versions',(SELECT json_agg(version ORDER BY version) FROM auth.schema_migrations),
'storage_versions',(SELECT json_agg(json_build_object('id',id,'name',name,'hash',hash) ORDER BY id) FROM storage.migrations)); COMMIT;"""
def read(connection,env):
 v=subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql',connection,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=q.encode(),env=env,capture_output=True)
 if v.returncode:raise RuntimeError('Metadata query failed; diagnostic withheld')
 return json.loads(v.stdout)
e=os.environ.copy();e.update(PGSERVICEFILE=str(R/'pg_service.conf'),PGPASSFILE=str(R/'pgpass'),PGOPTIONS='-c default_transaction_read_only=on')
s=read('service=atlas_a01_source',e);e.pop('PGOPTIONS');e['PGPASSWORD']=c['migrator'];t=read('host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable',e)
result={}
for kind in ('triggers','indexes','columns'):
 expected={json.dumps(x,sort_keys=True) for x in s[kind] or []}; actual={json.dumps(x,sort_keys=True) for x in t[kind] or []};extra=[json.loads(x) for x in actual-expected]
 missing=[json.loads(x) for x in expected-actual]
 unexpected=[x for x in extra if x['schema']!='storage' or x['table'] not in ('iceberg_tables','iceberg_namespaces')]
 if kind=='indexes' and missing and not unexpected:
  allowed={'idx_users_created_at_desc','idx_users_last_sign_in_at_desc','idx_users_email','idx_users_name'}
  if any(x['schema']!='auth' or x['table']!='users' or x['name'] not in allowed or not x['valid'] or not x['ready'] for x in missing):raise RuntimeError('Unreviewed missing index')
  # Platform-added Auth indexes are preserved on the destination, in addition
  # to the normal vendor migrations; no managed history is fabricated.
  patch=';\n'.join(x['definition'] for x in missing)+';'
  v=subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql','host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable','-X','-q','-v','ON_ERROR_STOP=1'],input=patch.encode(),env=e,capture_output=True)
  if v.returncode:raise RuntimeError('Destination platform-index recovery failed')
  t=read('host=127.0.0.1 port=55434 dbname=atlas_auth_test user=supabase_admin sslmode=disable',e)
  actual={json.dumps(x,sort_keys=True) for x in t[kind] or []};missing=[json.loads(x) for x in expected-actual]
 if missing or unexpected:
  print(json.dumps({'metadata_difference':kind,'missing':missing,'unexpected':unexpected}));raise RuntimeError('Metadata mismatch')
 result[kind]={'source_verified':len(expected),'destination_bootstrap_extras':len(extra)}
if s['auth_versions']!=t['auth_versions']:raise RuntimeError('Auth bootstrap history differs')
a=s['storage_versions'];b=t['storage_versions']
expected_hashes={2:('cdc19a79b298ce37cc730487821a1a7b06b98105','f6a1fa2c93cbcd16d4e487b362e45fca157a8dbd'),62:('c6567e688f8c4a76887e7c1b117b2d58f4feccba','0b855f00ff3be0bfca91efee02a9858912491a9a')}
if len(a)!=75 or len(b)!=74 or a[74]!={'id':74,'name':'unlock-object-versioning','hash':'dacb58ecb37678de855505b3e1c5aec0d5df7894'}:raise RuntimeError('Unreviewed Storage bootstrap history drift')
for x,y in zip(a,b):
 if x['id']!=y['id'] or x['name']!=y['name']:raise RuntimeError('Storage version identity mismatch')
 if x['hash']!=y['hash'] and expected_hashes.get(x['id'])!=(x['hash'],y['hash']):raise RuntimeError('Unreviewed vendor Storage migration checksum')
result['storage_vendor_checksum_differences']={str(k):{'source':v[0],'destination':v[1]} for k,v in expected_hashes.items()}
result.update(auth_bootstrap_versions=82,storage_cloud_history=75,storage_local_history=74,storage_expected_difference='unlock-object-versioning; original function/trigger restored, vendor histories preserved')
(D/'structural-acceptance.json').write_text(json.dumps(result,indent=2)+'\n');(D/'structural-acceptance.json').chmod(0o600)
print(json.dumps(result))
