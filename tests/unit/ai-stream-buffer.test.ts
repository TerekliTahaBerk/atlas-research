import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIStreamEvent } from '../../packages/ai/src';
import { coalesceDeltas } from '../../apps/web/src/features/ai/server/stream-buffer';

afterEach(() => vi.useRealTimers());
describe('bounded provider delta coalescing', () => {
  it.each([100, 500])(
    'preserves %i burst deltas and error ordering with bounded batches',
    async (count) => {
      async function* events(): AsyncGenerator<AIStreamEvent, void, unknown> {
        for (let i = 0; i < count; i++) yield { type: 'delta', text: 'x' };
        yield { type: 'error', code: 'INVALID_OUTPUT', retryable: false };
      }
      const result = [];
      for await (const event of coalesceDeltas(
        events(),
        new AbortController().signal,
      ))
        result.push(event);
      const deltas = result.filter((event) => event.type === 'delta');
      expect(deltas.map((event) => event.text).join('')).toBe(
        'x'.repeat(count),
      );
      expect(deltas).toHaveLength(Math.ceil(count / 256));
      expect(result.at(-1)?.type).toBe('error');
    },
  );
  it('flushes a pending delta at 50ms while a single provider read is stalled', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let pulls = 0;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* events(): AsyncGenerator<AIStreamEvent, void, unknown> {
      pulls++;
      yield { type: 'delta', text: 'pending' };
      pulls++;
      await blocked;
    }
    const abort = new AbortController();
    const iterator = coalesceDeltas(events(), abort.signal);
    let flushed = false;
    const pending = iterator.next().then((result) => {
      flushed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(flushed).toBe(false);
    expect(pulls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).value).toEqual({ type: 'delta', text: 'pending' });
    const stopped = iterator.next();
    abort.abort(new Error('Disconnected'));
    await expect(stopped).rejects.toThrow('Disconnected');
    release();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('drops buffered text on abort and never starts an already cancelled provider', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = vi.fn();
    async function* events(): AsyncGenerator<AIStreamEvent, void, unknown> {
      started();
      yield { type: 'delta', text: 'private buffered text' };
      await blocked;
    }
    const iterator = coalesceDeltas(events(), abort.signal);
    const pending = iterator.next();
    const rejection = expect(pending).rejects.toThrow('Revoked');
    await vi.advanceTimersByTimeAsync(1);
    abort.abort(new Error('Revoked'));
    await rejection;
    release();
    const before = started.mock.calls.length;
    await expect(coalesceDeltas(events(), abort.signal).next()).rejects.toThrow(
      'Revoked',
    );
    expect(started).toHaveBeenCalledTimes(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
