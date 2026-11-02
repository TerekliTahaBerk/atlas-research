"""Accept the isolated recovery only after all independent evidence passes."""
import hashlib,json,os,subprocess,urllib.request
from pathlib import Path
from datetime import datetime,timezone,timedelta
R=Path('/Users/berk.terekli/AtlasRecovery/2026-11-02');D=sorted(R.glob('capture-*'))[-1]
r=json.loads((D/'receipt.json').read_text());c=json.loads((R/'restore-config.json').read_text())
app=json.loads((D/'application-acceptance.json').read_text());structure=json.loads((D/'structural-acceptance.json').read_text())
assert r['restore_database_verified'] and app['restored_workspace_project_http']=='PASS' and app['outsider_project_status']==404
assert structure['auth_bootstrap_versions']==82 and structure['triggers']['source_verified']==8
for name,digest in r['ciphertexts'].items():
 assert hashlib.sha256((D/name).read_bytes()).hexdigest()==digest
request=urllib.request.Request('http://127.0.0.1:54322/storage/v1/bucket',headers={'apikey':c['service_key'],'Authorization':'Bearer '+c['service_key']})
with urllib.request.urlopen(request,timeout=15) as response:assert response.status==200 and json.load(response)==[]
# Verify actual Docker published bindings and network isolation without copying
# the container configurations (which contain destination-only credentials).
def output(args):return subprocess.run(args,capture_output=True,check=True).stdout
ids=output(['docker-compose','-f',str(R/'restore-compose.yml'),'ps','-q']).decode().splitlines()
containers=json.loads(output(['docker','inspect',*ids]));published=[]
for item in containers:
 for bindings in item['NetworkSettings']['Ports'].values():
  for binding in bindings or []:
   assert binding['HostIp']=='127.0.0.1';published.append(binding['HostPort'])
assert sorted(published)==['54322','55434']
networks=json.loads(output(['docker','network','inspect','atlas-a01-recovery_default']))
assert networks[0]['Internal'] is True
assert all(len(x['NetworkSettings']['Networks'])==1 for x in containers if 'gateway' not in x['Name'])
now=datetime.now(timezone.utc);cutoff=datetime.strptime(r['captured_at'],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
r.update(restore_verified=True,accepted_at=now.isoformat(),capture_to_acceptance_wall_seconds=round((now-cutoff).total_seconds(),1),storage_api_empty_verified=True,loopback_only_verified=True,cloned_sessions_invalidated_before_auth_start=True,application_evidence='application-acceptance.json',structural_evidence='structural-acceptance.json',backup_expires=(cutoff+timedelta(days=30)).isoformat(),restore_expires=(cutoff+timedelta(days=7)).isoformat(),recovery_limitations=['Single FileVault Mac; no offsite copy','No continuous backup/PITR or guaranteed RPO/RTO','Managed Storage vendor history retained with reviewed structural compatibility patch'])
for p in D.glob('destination-baseline-verified-*.jsonl.age'):r['ciphertexts'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(D/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');(D/'receipt.json').chmod(0o600)
print(json.dumps({'G2':'PASS','accepted_at':r['accepted_at'],'wall_seconds':r['capture_to_acceptance_wall_seconds'],'storage':'EMPTY_VERIFIED','network':'LOOPBACK_ONLY','backup_expires':r['backup_expires'],'restore_expires':r['restore_expires']}))
