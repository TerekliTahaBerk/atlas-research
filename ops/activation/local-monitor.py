"""Local-only supervision for the owner-approved Atlas development workers.

No remote telemetry or messages. Parsers remain offline and credential-free.
Run once for a redacted health receipt, or --run under the user's launchd agent.
"""
import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path('/Users/berk.terekli/AtlasRecovery/2026-11-02/activation')
COMPOSE = ROOT / 'workers-compose.yml'
SERVICES = ['scanner-broker', 'validator', 'definitions', 'extractor']
PREFIX = 'atlas-hosted-development-'


def command(args, timeout=45):
    result = subprocess.run(args, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Local operation failed; diagnostics withheld')
    return result.stdout


def identity_expiry():
    value = json.loads((ROOT / 'vercel_access.json').read_text())
    config = json.loads((ROOT / 'runtime-config.json').read_text())
    if value['origin'] != config['origin']:
        raise ValueError('Origin mismatch')
    part = value['token'].split('.')[1]
    return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))['exp']


def health():
    result = {'at': int(time.time()), 'checks': {}}
    checks = result['checks']
    checks['identity_fresh'] = identity_expiry() > time.time() + 300
    for service in SERVICES:
        name = PREFIX + service + '-1'
        data = json.loads(command(['docker', 'inspect', name]))[0]
        checks[service + '_running'] = data['State']['Running'] is True
        checks[service + '_no_host_ports'] = not any(data['NetworkSettings']['Ports'].values())
        checks[service + '_read_only'] = data['HostConfig']['ReadonlyRootfs'] is True
        if service in ['validator', 'extractor']:
            checks[service + '_no_secrets'] = not any('/run/secrets' in mount['Destination'] for mount in data['Mounts'])
            networks = list(data['NetworkSettings']['Networks'])
            checks[service + '_offline'] = all(json.loads(command(['docker', 'network', 'inspect', name]))[0]['Internal'] for name in networks)
    # Validate the broker's own UTC timestamp. Docker's relative --since filter
    # can use a stale daemon clock immediately after the VM resumes.
    lines = command(['docker', 'logs', '--tail', '3', PREFIX + 'scanner-broker-1']).decode().splitlines()
    beats = []
    for line in lines:
        try:
            event = json.loads(line)
            if event.get('event') == 'SCANNER_POLL_OK':
                beats.append(event['at'])
        except (ValueError, TypeError, KeyError):
            continue
    checks['scanner_api_heartbeat'] = bool(beats) and max(beats) > time.time() - 240
    age = float(command(['docker', 'exec', PREFIX + 'validator-1', 'python3', '-c',
        "import pathlib,time; p=list(pathlib.Path('/signatures').glob('daily.*')); print(time.time()-max(x.stat().st_mtime for x in p))"]).decode())
    checks['signature_age_under_48h'] = age < 172800
    result['signature_age_seconds'] = round(age)
    result['status'] = 'PASS' if all(checks.values()) else 'FAIL'
    (ROOT / 'worker-health.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'worker-health.json').chmod(0o600)
    return result


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    if args.run:
        try:
            command(['docker', 'info', '--format', '{{.ServerVersion}}'])
        except Exception:
            command(['colima', 'start'], timeout=180)
        command(['docker-compose', '-f', str(COMPOSE), 'up', '-d', *SERVICES], timeout=120)
    spec = importlib.util.spec_from_file_location('atlas_refresh', Path(__file__).with_name('refresh-vercel-access.py'))
    refresh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(refresh)
    refreshed = 0
    while True:
        try:
            if args.run and time.time() - refreshed > 3600:
                refresh.refresh()
                refreshed = time.time()
            print(json.dumps(health()), flush=True)
        except Exception:
            print(json.dumps({'event': 'ATLAS_LOCAL_MONITOR_UNAVAILABLE', 'at': int(time.time())}), flush=True)
            if not args.run:
                raise RuntimeError('Local health check failed; details withheld') from None
        if not args.run:
            return
        time.sleep(60)


if __name__ == '__main__':
    main()
