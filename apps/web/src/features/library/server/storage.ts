import 'server-only';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PlatformError } from '@/features/platform/server/errors';

/*
 * Private object storage. The service credential stays on the server; the
 * browser only ever receives single-object grants that this module signs
 * after Atlas authorization. Signed URLs are never logged or persisted.
 */
export const QUARANTINE_BUCKET = 'atlas-quarantine';
export const SOURCE_BUCKET = 'atlas-sources';
export const DOWNLOAD_TTL_SECONDS = 60;

export interface SourceStorage {
  createUploadGrant(key: string): Promise<{ url: string; token: string }>;
  readQuarantined(key: string, maxBytes: number): Promise<Uint8Array | null>;
  removeQuarantined(key: string): Promise<void>;
  accept(quarantineKey: string, acceptedKey: string): Promise<void>;
  signDownload(acceptedKey: string, seconds: number): Promise<string>;
  signQuarantineRead(key: string, seconds: number): Promise<string>;
}

export function storageConfigured(env = process.env) {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.ATLAS_STORAGE_SERVICE_KEY);
}

function unavailable(): never {
  throw new PlatformError(
    'EXTERNAL_PROVIDER_ERROR',
    'Private file storage is unavailable. Try again later.',
  );
}

export function supabaseSourceStorage(env = process.env): SourceStorage {
  if (!storageConfigured(env))
    throw new PlatformError(
      'FORBIDDEN',
      'Private PDF storage is not configured for this environment.',
    );
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.ATLAS_STORAGE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const quarantine = () => client.storage.from(QUARANTINE_BUCKET);
  const sources = () => client.storage.from(SOURCE_BUCKET);
  return {
    async createUploadGrant(key) {
      // upsert=false: an existing object can never be overwritten.
      const { data, error } = await quarantine().createSignedUploadUrl(key, {
        upsert: false,
      });
      if (error || !data) unavailable();
      return { url: data.signedUrl, token: data.token };
    },
    async readQuarantined(key, maxBytes) {
      const { data, error } = await quarantine().download(key);
      if (error || !data) return null;
      if (data.size > maxBytes) return new Uint8Array(maxBytes + 1);
      return new Uint8Array(await data.arrayBuffer());
    },
    async removeQuarantined(key) {
      await quarantine().remove([key]);
    },
    async accept(quarantineKey, acceptedKey) {
      const { error } = await quarantine().copy(quarantineKey, acceptedKey, {
        destinationBucket: SOURCE_BUCKET,
      });
      if (error) unavailable();
    },
    async signDownload(acceptedKey, seconds) {
      const { data, error } = await sources().createSignedUrl(
        acceptedKey,
        seconds,
        { download: false },
      );
      if (error || !data) unavailable();
      return data.signedUrl;
    },
    async signQuarantineRead(key, seconds) {
      const { data, error } = await quarantine().createSignedUrl(key, seconds);
      if (error || !data) unavailable();
      return data.signedUrl;
    },
  };
}

/** Unpredictable keys; the scope prefix aids operations, not security. */
export function quarantineKey(projectId: string) {
  return `quarantine/${projectId}/${crypto.randomUUID()}/${randomBytes(24).toString('base64url')}.pdf`;
}
export function acceptedKey(projectId: string, sourceVersionId: string) {
  return `accepted/${projectId}/${sourceVersionId}/${randomBytes(24).toString('base64url')}.pdf`;
}

/**
 * Byte-level checks only: length, SHA-256, PDF header and trailer. No PDF
 * parsing happens in the web process; structural/malware checks belong to
 * the isolated scanner.
 */
export function inspectPdfBytes(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  const tail = Buffer.from(
    bytes.subarray(Math.max(0, bytes.length - 2048)),
  ).toString('latin1');
  if (!head.startsWith('%PDF-')) return 'The file is not a PDF document.';
  if (!/%%EOF\s*$/.test(tail)) return 'The PDF is incomplete or truncated.';
  return null;
}
