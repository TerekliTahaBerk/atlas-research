import { describe, expect, it } from 'vitest';
import { scannerResponse } from '../../apps/web/src/features/library/server/routes';

describe('scanner request streaming bound before authentication', () => {
  it.each([false, true])(
    'cancels an oversized stream without Content-Length (multibyte=%s)',
    async (multibyte) => {
      let cancelled = false;
      let pulls = 0;
      const chunk = new TextEncoder().encode(
        multibyte ? 'é'.repeat(1024) : 'a'.repeat(2048),
      );
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls++;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request(
        'https://atlas.example/api/v1/internal/scanner/claim',
        { method: 'POST', body, duplex: 'half' } as RequestInit,
      );
      const response = await scannerResponse(
        ['internal', 'scanner', 'claim'],
        request,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR', message: 'Request is too large.' },
      });
      expect(cancelled).toBe(true);
      expect(pulls).toBeLessThanOrEqual(4);
    },
  );
  it('does not accept a small unsigned body', async () => {
    const response = await scannerResponse(
      ['internal', 'scanner', 'claim'],
      new Request('https://atlas.example', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(404);
  });
});
