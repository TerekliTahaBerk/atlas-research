import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { PlatformError } from '@/features/platform/server/errors';

/*
 * Application-level encryption for third-party credentials (A03 Zotero).
 * AES-256-GCM with a 32-byte server key from ATLAS_INTEGRATION_KEY
 * (base64/base64url). The owner's profile ID and provider are bound as
 * additional authenticated data, so a ciphertext cannot be moved to another
 * user or provider. The database stores only `v1.<iv>.<ciphertext>.<tag>`;
 * plaintext keys exist in memory for the duration of one request.
 */
const b64 = (value: Buffer) => value.toString('base64url');
function key() {
  const raw = process.env.ATLAS_INTEGRATION_KEY;
  if (!raw || !/^(?:[A-Za-z0-9+/]{43}=?|[A-Za-z0-9_-]{43}=?)$/.test(raw))
    return null;
  const bytes = Buffer.from(
    raw,
    raw.includes('-') || raw.includes('_') ? 'base64url' : 'base64',
  );
  return bytes.length === 32 ? bytes : null;
}
export const integrationsConfigured = () => key() !== null;
/** Purpose-separated authentication of preview metadata, never a bearer grant. */
export function signImportContext(context: string) {
  const k = key();
  if (!k)
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'External library connections are not configured on this server.',
    );
  return createHmac('sha256', k)
    .update('atlas-zotero-preview:v1:')
    .update(context)
    .digest('hex');
}
export function verifyImportContext(context: string, signature: string) {
  if (!key() || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signImportContext(context), 'hex'),
    Buffer.from(signature, 'hex'),
  );
}
const aad = (profileId: string, provider: string) =>
  Buffer.from(`atlas-credential:v1:${provider}:${profileId}`);

export function sealCredential(
  secret: string,
  profileId: string,
  provider: string,
) {
  const k = key();
  if (!k)
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'External library connections are not configured on this server.',
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  cipher.setAAD(aad(profileId, provider));
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${b64(iv)}.${b64(body)}.${b64(cipher.getAuthTag())}`;
}

/** Returns null (never throws a detail) for a tampered, foreign or rotated envelope. */
export function openCredential(
  envelope: string,
  profileId: string,
  provider: string,
) {
  const k = key();
  const parts = envelope.split('.');
  if (!k || parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      k,
      Buffer.from(parts[1]!, 'base64url'),
    );
    decipher.setAAD(aad(profileId, provider));
    decipher.setAuthTag(Buffer.from(parts[3]!, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2]!, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
