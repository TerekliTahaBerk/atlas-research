import type { AIStreamEvent } from '@atlas/ai';

/** Bound delivery work by characters/time, preserving order and a single pending provider read. */
export async function* coalesceDeltas(
  events: AsyncIterable<AIStreamEvent>,
  signal: AbortSignal,
): AsyncGenerator<AIStreamEvent, void, unknown> {
  signal.throwIfAborted();
  const iterator = events[Symbol.asyncIterator]();
  let next = iterator.next();
  let text = '';
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      signal.throwIfAborted();
      const timeout = text
        ? new Promise<'flush'>((resolve) => {
            timer = setTimeout(
              () => resolve('flush'),
              Math.max(0, 50 - (performance.now() - started)),
            );
          })
        : new Promise<never>(() => {});
      const result = await Promise.race([next, timeout, aborted]);
      if (timer) clearTimeout(timer);
      if (result === 'flush') {
        yield { type: 'delta', text };
        text = '';
        continue;
      }
      if (result.done) break;
      // Never pull a second event while database delivery of this batch is pending.
      if (result.value.type === 'delta') {
        if (!text) started = performance.now();
        text += result.value.text;
        if (text.length >= 256) {
          yield { type: 'delta', text };
          text = '';
        }
      } else {
        if (text) {
          yield { type: 'delta', text };
          text = '';
        }
        yield result.value;
      }
      next = iterator.next();
    }
    if (text) yield { type: 'delta', text };
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    // The request's AbortSignal stops provider IO. Do not block termination on a stuck iterator.
    void iterator.return?.().catch(() => {});
  }
}
