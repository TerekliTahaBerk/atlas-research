import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
function key() {
  const value = process.env.ATLAS_RATE_SECRET;
  if (!value || value.length < 32)
    throw new Error('Recovery signing is not configured.');
  return value;
}
export function recoveryMarker(userId: string, expires = Date.now() + 600000) {
  const payload = `${userId}.${expires}`;
  return `${payload}.${createHmac('sha256', key()).update(`recovery:${payload}`).digest('hex')}`;
}
export function validRecoveryMarker(
  marker: string | undefined,
  userId: string,
) {
  if (!marker) return false;
  const [actor, expiry, signature] = marker.split('.');
  if (
    actor !== userId ||
    !expiry ||
    !signature ||
    !/^\d{13}$/.test(expiry) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Number(expiry) <= Date.now()
  )
    return false;
  const expected = createHmac('sha256', key())
    .update(`recovery:${actor}.${expiry}`)
    .digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
