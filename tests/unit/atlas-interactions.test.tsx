import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { ToastProvider } from '../../apps/web/src/components/atlas/toast';
import { AtlasComposer } from '../../apps/web/src/features/atlas-ai/atlas-composer';
import { AtlasSurface } from '../../apps/web/src/features/atlas-ai/atlas-surface';
import {
  AtlasProvider,
  useAtlas,
} from '../../apps/web/src/features/atlas-ai/atlas-provider';
import {
  commandsFor,
  filterMentions,
  mentionGroups,
} from '../../apps/web/src/features/atlas-ai/contracts';
import type { ScreenKey } from '../../apps/web/src/features/shell/navigation';
import { PreviewStoreProvider } from '../../apps/web/src/features/shell/preview-store';
import { ChannelsScreen } from '../../apps/web/src/features/channels/channels-screen';
import { VersionHistoryDialog } from '../../apps/web/src/features/overlays/version-history-dialog';
function wrap(children: React.ReactNode, screen: ScreenKey = 'overview') {
  return (
    <TooltipProvider>
      <ToastProvider>
        <PreviewStoreProvider>
          <AtlasProvider screen={screen}>{children}</AtlasProvider>
        </PreviewStoreProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
function setReducedMotion(reduce: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}
afterEach(() => {
  vi.useRealTimers();
  setReducedMotion(false);
});
describe('Atlas composer mentions and commands', () => {
  it('preserves explicit chips when a late editor reapplies the same ambient resource', async () => {
    function LateContext() {
      const atlas = useAtlas();
      return (
        <>
          <button
            onClick={() =>
              atlas.addChip({
                id: 'p1',
                kind: 'paper',
                title: 'Explicit paper',
              })
            }
          >
            Add explicit
          </button>
          <button
            onClick={() =>
              atlas.setContext([
                { id: 'ms-main.tex', kind: 'manuscript', title: 'main.tex' },
              ])
            }
          >
            Editor mounted
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <LateContext />
          <AtlasSurface placement="page" />
        </>,
        'manuscript',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Add explicit' }));
    await user.click(screen.getByRole('button', { name: 'Editor mounted' }));
    expect(
      screen.getByRole('button', { name: 'Remove Explicit paper' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove main.tex' }),
    ).toBeVisible();
  });

  it('never promises automatic saving in empty preview history', () => {
    render(
      wrap(
        <VersionHistoryDialog
          open
          onOpenChange={() => {}}
          title="Sample document"
          empty
        />,
      ),
    );
    expect(
      screen.getByText(
        'No saved versions in this sample. Local edits are not saved.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/saved automatically/i)).not.toBeInTheDocument();
  });
  it('uses newly attached inline context in the sample reply, rather than the previous ambient context', async () => {
    setReducedMotion(true);
    function InlineAction() {
      const atlas = useAtlas();
      return (
        <button
          onClick={() =>
            atlas.ask({
              prompt: '/summarize',
              chips: [{ id: 'd2', kind: 'document', title: 'Lab meeting' }],
            })
          }
        >
          Summarize selection
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <InlineAction />
          <AtlasSurface placement="page" />
        </>,
      ),
    );
    await user.click(
      screen.getByRole('button', { name: 'Summarize selection' }),
    );
    expect(screen.getByText('Summary of Lab meeting.')).toBeVisible();
  });
  it('attaches a structured mention with the keyboard and removes it accessibly', async () => {
    const user = userEvent.setup();
    render(wrap(<AtlasSurface placement="page" />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    await user.type(input, '@Chen');
    const list = screen.getByRole('listbox', { name: 'Mention suggestions' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('');
    const remove = screen.getByRole('button', {
      name: 'Remove Chen & Duarte, 2023',
    });
    await user.click(remove);
    expect(
      screen.queryByRole('button', { name: 'Remove Chen & Duarte, 2023' }),
    ).not.toBeInTheDocument();
  });
  it('moves the active option with the arrow keys and wraps', async () => {
    const user = userEvent.setup();
    render(wrap(<AtlasComposer />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    await user.type(input, '@');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option').at(-1)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('dismisses a menu on Escape without submitting or erasing the draft', async () => {
    const user = userEvent.setup();
    render(wrap(<AtlasSurface placement="page" />, 'doc'));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    const before = screen.getAllByRole('article').length;
    await user.type(input, '/rew');
    expect(
      screen.getByRole('listbox', { name: 'Slash commands' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('/rew');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(before);
  });
  it('offers commands specific to the active surface', () => {
    const ids = (s: ScreenKey) => commandsFor(s, '').map((c) => c.id);
    expect(ids('manuscript')).toEqual(
      expect.arrayContaining(['latex', 'cite', 'rewrite']),
    );
    expect(ids('tasks')).not.toContain('latex');
    expect(ids('tasks')).not.toContain('rewrite');
    expect(ids('tasks')).toContain('create-task');
    expect(commandsFor('manuscript', 'lat').map((c) => c.id)).toEqual([
      'latex',
    ]);
  });
  it('covers every structured entity type with stable IDs', () => {
    const kinds = new Set(
      mentionGroups.flatMap((g) => g.items.map((i) => i.kind)),
    );
    for (const kind of [
      'paper',
      'document',
      'task',
      'person',
      'project',
      'channel',
      'manuscript',
      'experiment',
    ])
      expect(kinds).toContain(kind);
    const ids = mentionGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(filterMentions('zzz-no-match')).toEqual([]);
  });
});
describe('Atlas sample responses', () => {
  it('labels a reply as a sample and shows the final state at once under reduced motion', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    render(wrap(<AtlasSurface placement="page" />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    const before = screen.getAllByText('Sample response').length;
    await user.type(input, 'What is the main risk?{Enter}');
    expect(screen.getByText('What is the main risk?')).toBeVisible();
    expect(screen.getAllByText('Sample response')).toHaveLength(before + 1);
    expect(screen.getByRole('button', { name: 'Send (Enter)' })).toBeVisible();
  });
  it('plays a labeled preview sequence that can be stopped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(wrap(<AtlasSurface placement="page" />));
    await user.type(
      screen.getByRole('combobox', { name: 'Ask Atlas' }),
      'Summarize this{Enter}',
    );
    const stop = screen.getByRole('button', { name: 'Stop (Esc)' });
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
    await user.click(stop);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByRole('button', { name: 'Send (Enter)' })).toBeVisible();
  });
});
describe('Channels preview', () => {
  it('keeps a sent message local to the tab and labels it undelivered', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelsScreen />, 'channels'));
    await user.type(
      screen.getByRole('textbox', { name: /Message #/ }),
      'A local research thought',
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText(/A local research thought/)).toBeVisible();
    expect(screen.getByText('Stays in this tab · not delivered')).toBeVisible();
  });
});
