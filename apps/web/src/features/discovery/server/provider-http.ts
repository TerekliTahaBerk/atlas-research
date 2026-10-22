import 'server-only';
/*
 * Bounded HTTP access to fixed scholarly API hosts. Callers pass only a path
 * and query; hosts come from server configuration, redirects are refused and
 * responses are size-capped, so no user-controlled URL is ever fetched.
 */
export type ProviderResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'unavailable' };

export interface ProviderHttpOptions {
  baseUrl: string;
  path: string;
  query: Record<string, string | undefined>;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  /** Additional attempts after the first; bounded for 429/5xx/timeouts. */
  retries?: number | undefined;
  /** Longest Retry-After the request waits before reporting rate limiting. */
  maxRetryWaitMs?: number | undefined;
  maxBytes?: number | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function retryAfterSeconds(header: string | null) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function readBounded(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('response too large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function providerGet(
  options: ProviderHttpOptions,
): Promise<ProviderResult<unknown>> {
  const url = new URL(options.path, options.baseUrl);
  for (const [key, value] of Object.entries(options.query))
    if (value !== undefined) url.searchParams.set(key, value);
  const sleep = options.sleep ?? wait;
  const retries = Math.min(options.retries ?? 2, 3);
  const maxRetryWait = options.maxRetryWaitMs ?? 4000;
  let lastRateLimit: number | null | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 8000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...options.headers },
        redirect: 'error',
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // Network failure or timeout: back off and retry within the bound.
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      return { kind: 'unavailable' };
    }
    if (response.status === 404) {
      await response.body?.cancel();
      return { kind: 'not_found' };
    }
    if (response.status === 429) {
      await response.body?.cancel();
      lastRateLimit = retryAfterSeconds(response.headers.get('retry-after'));
      const waitMs =
        lastRateLimit === null ? backoff(attempt) : lastRateLimit * 1000;
      if (attempt < retries && waitMs <= maxRetryWait) {
        await sleep(waitMs);
        continue;
      }
      return { kind: 'rate_limited', retryAfterSeconds: lastRateLimit || null };
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      return { kind: 'unavailable' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { kind: 'unavailable' };
    }
    try {
      const text = await readBounded(response, options.maxBytes ?? 4_000_000);
      return { kind: 'ok', data: JSON.parse(text) as unknown };
    } catch {
      return { kind: 'unavailable' };
    }
  }
  return lastRateLimit !== undefined
    ? { kind: 'rate_limited', retryAfterSeconds: lastRateLimit || null }
    : { kind: 'unavailable' };
}

function backoff(attempt: number) {
  return Math.round(250 * 2 ** attempt + Math.random() * 150);
}
