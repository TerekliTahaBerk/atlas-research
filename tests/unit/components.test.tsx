import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { Btn, IconBtn } from '../../apps/web/src/components/atlas/button';
import { Segmented } from '../../apps/web/src/components/atlas/segmented';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  ModalTrigger,
} from '../../apps/web/src/components/atlas/overlay';
import { ErrorBanner } from '../../apps/web/src/components/atlas/states';
import {
  contrastPairs,
  contrastRatio,
  tokenTable,
} from '../../apps/web/src/features/system/tokens';
import NotFound from '../../apps/web/src/app/not-found';
describe('foundation components', () => {
  it('suppresses disabled button activation', async () => {
    const click = vi.fn();
    render(
      <Btn disabled onClick={click}>
        Unavailable
      </Btn>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(click).not.toHaveBeenCalled();
  });
  it('requires an accessible name on icon buttons', () => {
    render(
      <TooltipProvider>
        <IconBtn label="More actions">
          <svg aria-hidden="true" />
        </IconBtn>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();
  });
  it('supports modal keyboard close and focus restoration', async () => {
    const user = userEvent.setup();
    render(
      <Modal>
        <ModalTrigger asChild>
          <Btn>Open details</Btn>
        </ModalTrigger>
        <ModalContent>
          <ModalTitle>Details</ModalTitle>
          <ModalDescription>Preview details.</ModalDescription>
        </ModalContent>
      </Modal>,
    );
    const trigger = screen.getByRole('button', { name: 'Open details' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('moves a segmented control with the arrow keys', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Segmented
        label="View"
        value="grid"
        onChange={change}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
      />,
    );
    const grid = screen.getByRole('radio', { name: 'Grid' });
    expect(grid).toHaveAttribute('aria-checked', 'true');
    grid.focus();
    await user.keyboard('{ArrowRight}');
    expect(change).toHaveBeenCalledWith('list');
  });
  it('announces error banners and keeps a real retry callback', async () => {
    const retry = vi.fn();
    render(
      <ErrorBanner
        title="Couldn’t load"
        action={<Btn onClick={retry}>Try again</Btn>}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('provides a not-found recovery link', () => {
    render(<NotFound />);
    expect(screen.getByText('This path is still unexplored')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to workspace' }),
    ).toHaveAttribute('href', '/app');
  });
});
describe('design tokens', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'apps/web/src/styles/globals.css'),
    'utf8',
  );
  function block(selector: string) {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start));
  }
  const dark = block(':root,');
  const light = block("[data-theme='light'],");
  it.each(tokenTable.map((t) => [t.token, t] as const))(
    'documents %s exactly as the stylesheet defines it',
    (token, row) => {
      expect(dark).toMatch(new RegExp(`${token}:\\s*${row.dark};`, 'i'));
      expect(light).toMatch(new RegExp(`${token}:\\s*${row.light};`, 'i'));
    },
  );
  it.each(['dark', 'light'] as const)(
    'meets WCAG AA for the %s theme pairs',
    (theme) => {
      for (const pair of contrastPairs(theme))
        expect(
          contrastRatio(pair.fg, pair.bg),
          `${pair.name}: ${pair.fg} on ${pair.bg}`,
        ).toBeGreaterThanOrEqual(pair.need);
    },
  );
});
