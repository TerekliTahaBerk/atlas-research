"""Refresh only Atlas's normal short-lived project OIDC identity on this Mac."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path('/Users/berk.terekli/AtlasRecovery/2026-11-02/activation')


def candidates(value):
    if isinstance(value, str):
        return [value] if re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', value) else []
    if isinstance(value, dict):
        return [token for item in value.values() for token in candidates(item)]
    if isinstance(value, list):
        return [token for item in value for token in candidates(item)]
    return []


def refresh():
    result = subprocess.run(['pnpm', 'dlx', 'vercel@65.9.0', 'project', 'token', 'web', '--json', '--scope', 'tereklitahaberks-projects'], capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError('Project identity refresh failed; credentials/diagnostic withheld')
    tokens = set(candidates(json.loads(result.stdout)))
    if len(tokens) != 1:
        raise RuntimeError('Unexpected project identity response')
    token = tokens.pop()
    payload = token.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + '=' * ((4-len(payload) % 4) % 4)))
    if (claims.get('project_id') != 'prj_Dpc2J2lhxJINNKZK32SK66072e2J'
            or claims.get('owner_id') != 'team_1foVBHG3EF94VyGJuzL461Vj'
            or claims.get('exp', 0) < time.time() + 300):
        raise RuntimeError('Wrong or expiring project identity')
    config = json.loads((ROOT/'runtime-config.json').read_text())
    path = ROOT/'vercel_access.json'
    # Keep the bind-mounted inode: a rare concurrent partial read fails closed
    # and the existing bounded broker retry handles it without losing a lease.
    path.write_text(json.dumps({'origin': config['origin'], 'token': token}))
    path.chmod(0o600)
    print(json.dumps({'event': 'ATLAS_PREVIEW_IDENTITY_REFRESHED', 'expires_at': claims['exp']}), flush=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    while True:
        try:
            refresh()
        except Exception:
            print(json.dumps({'event': 'ATLAS_PREVIEW_IDENTITY_REFRESH_FAILED'}), flush=True)
            if not args.run:
                raise RuntimeError('Preview identity unavailable; no value printed') from None
        if not args.run:
            return
        time.sleep(3600)


if __name__ == '__main__':
    main()
