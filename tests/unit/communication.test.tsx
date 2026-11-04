import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  communicationCommand,
  mentionIds,
  mentionToken,
  normalizeMessageBody,
  parseMessageBody,
  realtimeEvent,
  safeHref,
  visibleLength,
  type MessageDto,
} from '../../packages/core/src/index';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { MessageBody } from '@/features/communication/message-body';
import { Composer } from '@/features/communication/composer';
import {
  addPending,
  emptyTimeline,
  mergeMessages,
  patchPending,
  pendingFor,
  topLevel,
  type PendingSend,
} from '@/features/communication/timeline';

const ada = '11111111-1111-4111-8111-111111111111';
const grace = '22222222-2222-4222-8222-222222222222';
const message = (over: Partial<MessageDto> = {}): MessageDto => ({
  id: '33333333-3333-4333-8333-333333333333',
  channelId: '44444444-4444-4444-8444-444444444444',
  projectId: '55555555-5555-4555-8555-555555555555',
  seq: 1,
  changeSeq: 1,
  threadRootId: null,
  kind: 'USER',
  author: { id: ada, name: 'Ada Lovelace' },
  body: 'hello',
  mentions: [],
  references: [],
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  version: 1,
  createdAt: '2026-11-03T10:00:00.000Z',
  editedAt: null,
  deleted: false,
  aiRunId: null,
  clientKey: null,
  ...over,
});
const pending = (over: Partial<PendingSend> = {}): PendingSend => ({
  clientKey: '66666666-6666-4666-8666-666666666666',
  channelId: '44444444-4444-4444-8444-444444444444',
  threadRootId: null,
  body: 'draft',
  references: [],
  labels: [],
  status: 'sending',
  error: null,
  createdAt: 0,
  ...over,
});

describe('message body contract', () => {
  it('normalizes, bounds and counts mention tokens as one character', () => {
    expect(normalizeMessageBody('  hi\r\nthere  ')).toBe('hi\nthere');
    expect(() => normalizeMessageBody('   ')).toThrow();
    expect(() => normalizeMessageBody('bell\u0007')).toThrow();
    expect(() => normalizeMessageBody('x'.repeat(4001))).toThrow();
    const many = Array.from({ length: 21 }, (_, i) =>
      mentionToken(
        `${'0'.repeat(8)}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    ).join(' ');
    expect(() => normalizeMessageBody(many)).toThrow();
    expect(visibleLength(`${mentionToken(ada)} ok`)).toBe(4);
    expect(
      mentionIds(
        `${mentionToken(ada)} ${mentionToken(ada)} ${mentionToken(grace)}`,
      ),
    ).toEqual([ada, grace]);
  });

  it('only http(s) URLs without credentials become links', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('https://user:pw@example.org')).toBeNull();
    expect(safeHref('https://example.org/a?b=1')).toBe(
      'https://example.org/a?b=1',
    );
    expect(parseMessageBody('see https://example.org/x).')).toEqual([
      { type: 'text', text: 'see ' },
      {
        type: 'link',
        href: 'https://example.org/x',
        text: 'https://example.org/x',
      },
      { type: 'text', text: ').' },
    ]);
  });

  it('renders hostile text as inert text nodes', () => {
    const hostile =
      '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> [x](javascript:alert(1)) <a href="javascript:alert(2)">y</a>';
    const { container } = render(
      <p>
        <MessageBody body={hostile} mentions={[]} />
      </p>,
    );
    expect(container.querySelector('img,script')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).toBe(hostile);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('renders mentions from server-resolved identity, never from typed text', () => {
    render(
      <p>
        <MessageBody
          body={`${mentionToken(ada)} and @Grace ${mentionToken(grace)}`}
          mentions={[
            { id: ada, name: 'Ada Lovelace' },
            { id: grace, name: null },
          ]}
        />
      </p>,
    );
    expect(document.querySelector(`[data-mention="${ada}"]`)).toHaveTextContent(
      '@Ada Lovelace',
    );
    // A removed member is not named.
    expect(
      document.querySelector(`[data-mention="${grace}"]`),
    ).toHaveTextContent('@former member');
    // Plain "@Grace" text is not a mention.
    expect(document.querySelectorAll('[data-mention]')).toHaveLength(2);
  });

  it('accepts only the documented command shapes', () => {
    expect(
      communicationCommand.safeParse({
        command: 'message.send',
        channelId: ada,
        body: 'x',
        idempotencyKey: grace,
        authorId: grace,
      }).success,
    ).toBe(false);
    expect(
      communicationCommand.safeParse({
        command: 'reaction.set',
        messageId: ada,
        emoji: 'skull',
        active: true,
      }).success,
    ).toBe(false);
    // Realtime payloads carry identifiers only.
    expect(
      realtimeEvent.safeParse({
        event: 'message.created',
        payload: {
          channelId: ada,
          id: grace,
          seq: 1,
          changeSeq: 2,
          threadRootId: null,
        },
      }).success,
    ).toBe(true);
    expect(
      realtimeEvent.safeParse({
        event: 'message.created',
        payload: { body: 'secret' },
      }).success,
    ).toBe(false);
  });
});

describe('timeline merge (exactly-once, order-stable)', () => {
  it('dedupes duplicate and stale events and never regresses a newer copy', () => {
    let state = emptyTimeline();
    state = mergeMessages(
      state,
      [message({ body: 'v2', version: 2, changeSeq: 5 })],
      {
        changeSeq: 5,
      },
    );
    const same = mergeMessages(state, [
      message({ body: 'v2', version: 2, changeSeq: 5 }),
    ]);
    expect(same).toBe(state);
    state = mergeMessages(state, [
      message({ body: 'stale', version: 1, changeSeq: 1 }),
    ]);
    expect(topLevel(state).map((m) => m.body)).toEqual(['v2']);
    expect(state.changeSeq).toBe(5);
  });

  it('orders by server sequence regardless of arrival order', () => {
    const b = message({
      id: '77777777-7777-4777-8777-777777777777',
      seq: 2,
      changeSeq: 2,
    });
    const a = message({ seq: 1, changeSeq: 1 });
    const state = mergeMessages(emptyTimeline(), [b, a]);
    expect(topLevel(state).map((m) => m.seq)).toEqual([1, 2]);
  });

  it('reconciles a pending send exactly once when its committed copy arrives', () => {
    const p = pending();
    let state = addPending(emptyTimeline(), p);
    state = patchPending(state, p.clientKey, {
      status: 'failed',
      error: 'offline',
    });
    expect(pendingFor(state, null)[0]).toMatchObject({ status: 'failed' });
    // Retrying keeps the same key; the server returns one message for it.
    state = addPending(state, { ...p, status: 'retrying' });
    expect(state.pending).toHaveLength(1);
    state = mergeMessages(state, [
      message({ clientKey: p.clientKey, body: 'draft' }),
    ]);
    expect(state.pending).toHaveLength(0);
    expect(topLevel(state)).toHaveLength(1);
    state = mergeMessages(state, [
      message({ clientKey: p.clientKey, body: 'draft' }),
    ]);
    expect(topLevel(state)).toHaveLength(1);
  });
});

describe('composer', () => {
  it('converts chosen @mentions to stable ID tokens and keeps typed look-alikes as text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: ada, name: 'Ada Lovelace' }],
          requestId: 'r',
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const submit = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          channelId="44444444-4444-4444-8444-444444444444"
          label="Message #general"
          placeholder="Message #general"
          disabled={false}
          shares={[]}
          onRemoveShare={() => undefined}
          onSubmit={submit}
        />
      </TooltipProvider>,
    );
    const box = screen.getByRole('combobox', { name: 'Message #general' });
    await userEvent.type(box, 'hi @Ad');
    const option = await screen.findByRole('option', { name: 'Ada Lovelace' });
    fireEvent.mouseDown(option);
    await userEvent.type(box, 'and @Grace please');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]![0]).toEqual({
      body: `hi ${mentionToken(ada)} and @Grace please`,
      references: [],
      labels: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/people?q=Ad'),
      expect.anything(),
    );
  });

  it('keeps keystrokes typed immediately after a mention pick in order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: ada, name: 'Ada Lovelace' }],
          requestId: 'r',
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const submit = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          channelId="44444444-4444-4444-8444-444444444444"
          label="Message #general"
          placeholder="Message #general"
          disabled={false}
          shares={[]}
          onRemoveShare={() => undefined}
          onSubmit={submit}
        />
      </TooltipProvider>,
    );
    const box = screen.getByRole('combobox', { name: 'Message #general' });
    await userEvent.type(box, '@Ad');
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Ada Lovelace' }),
    );
    // No click: continue typing exactly where the caret was left.
    await userEvent.keyboard('can you review?{Enter}');
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]![0].body).toBe(
      `${mentionToken(ada)} can you review?`,
    );
  });

  it('explains why a read-only channel cannot be posted to', () => {
    render(
      <TooltipProvider>
        <Composer
          channelId="44444444-4444-4444-8444-444444444444"
          label="Message"
          placeholder="Message"
          disabled
          disabledReason="This channel is archived and read-only."
          shares={[]}
          onRemoveShare={() => undefined}
          onSubmit={() => undefined}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'archived and read-only',
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
