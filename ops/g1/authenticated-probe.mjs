#!/usr/bin/env node
// A01 G1 authenticated history-denial probe. Read-only HTTP GETs only.
//
// Usage (operator machine, after an ALREADY AUTHORIZED Atlas development
// session exists; this tool never signs in, refreshes or creates sessions):
//
//   ATLAS_G1_PUBLISHABLE_KEY=<public key> \
//     node ops/g1/authenticated-probe.mjs < token-file-or-pipe
//
// The access token is accepted ONLY on stdin and is never printed, logged,
// written or placed in argv/env. Output is a JSON verdict with HTTP statuses
// and the PostgREST error *code* only — no bodies, messages, user identity,
// key or token. Exit: 0 DENIED, 2 INCONCLUSIVE, 3 EXPOSED, 1 usage error.
import { pathToFileURL } from 'node:url';

export const TARGET_REF = 'hgngonpirctrwbckhbmy';
export const TARGET_URL = `https://${TARGET_REF}.supabase.co`;
const HISTORY = '/rest/v1/_prisma_migrations?select=id&limit=0';

const codeOf = async (response) => {
  try {
    const body = await response.json();
    return typeof body?.code === 'string' ? body.code.slice(0, 16) : null;
  } catch {
    return null;
  }
};
/** Valid, non-anonymous user; the identity itself never leaves this function. */
const validUser = async (response) => {
  if (response.status !== 200) return false;
  try {
    const user = await response.json();
    return (
      typeof user?.id === 'string' &&
      user.id.length > 0 &&
      user.is_anonymous !== true &&
      (user.aud === undefined || user.aud === 'authenticated')
    );
  } catch {
    return false;
  }
};

/**
 * Pure classification. DENIED requires a valid token before AND after the
 * probe plus a database permission error (SQLSTATE 42501). An empty 200 is
 * exposure, never denial; gateway/expired-token 401s are inconclusive.
 */
export function classify({ userBefore, history, historyCode, userAfter }) {
  if (!userBefore) return 'INCONCLUSIVE_TOKEN_INVALID';
  if (history === null) return 'INCONCLUSIVE_NETWORK';
  if (history >= 200 && history < 300) return 'EXPOSED';
  if (!userAfter) return 'INCONCLUSIVE_TOKEN_CHANGED';
  if ((history === 401 || history === 403) && historyCode === '42501')
    return 'DENIED';
  return 'INCONCLUSIVE_NOT_PERMISSION_DENIAL';
}

export async function runProbe({
  baseUrl = TARGET_URL,
  publishableKey,
  accessToken,
  fetchImpl = fetch,
}) {
  const headers = {
    apikey: publishableKey,
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  };
  const get = async (path) => {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        headers,
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      return null;
    }
  };
  const before = await get('/auth/v1/user');
  const userBefore = before ? await validUser(before) : false;
  const evidence = {
    target: new URL(baseUrl).host,
    userBeforeStatus: before?.status ?? null,
    historyStatus: null,
    historyCode: null,
    userAfterStatus: null,
  };
  // Never probe history with a token that Auth does not accept.
  if (!userBefore) return { verdict: classify({ userBefore }), evidence };
  const history = await get(HISTORY);
  evidence.historyStatus = history?.status ?? null;
  evidence.historyCode = history ? await codeOf(history) : null;
  const after = await get('/auth/v1/user');
  evidence.userAfterStatus = after?.status ?? null;
  const userAfter = after ? await validUser(after) : false;
  return {
    verdict: classify({
      userBefore,
      history: evidence.historyStatus,
      historyCode: evidence.historyCode,
      userAfter,
    }),
    evidence,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const fail = (message) => {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  };
  if (process.argv.length > 2)
    fail(
      'No arguments are accepted; the target is pinned and the token is read from stdin.',
    );
  if (
    Object.keys(process.env).some(
      (k) => /TOKEN|JWT|SESSION/i.test(k) && k.startsWith('ATLAS_G1'),
    )
  )
    fail(
      'Refusing: pass the access token on stdin only, never in the environment.',
    );
  const publishableKey = process.env.ATLAS_G1_PUBLISHABLE_KEY ?? '';
  if (
    !/^(sb_publishable_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9._-]{20,})$/.test(
      publishableKey,
    )
  )
    fail(
      'ATLAS_G1_PUBLISHABLE_KEY must be the project publishable (public) key.',
    );
  if (process.stdin.isTTY)
    fail('Pipe the access token on stdin; interactive entry is not supported.');
  const accessToken = await readStdin();
  if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken))
    fail('stdin did not contain a single JWT access token.');
  const result = await runProbe({ publishableKey, accessToken });
  process.stdout.write(
    `${JSON.stringify({ ...result, checkedAt: new Date().toISOString() })}\n`,
  );
  process.exit(
    result.verdict === 'DENIED' ? 0 : result.verdict === 'EXPOSED' ? 3 : 2,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
