import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@atlas/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@atlas/ui/components/dialog';
import { ProjectOverview } from '../../apps/web/src/features/projects/project-overview';
import { AppShell } from '../../apps/web/src/features/shell/app-shell';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { ErrorState } from '../../apps/web/src/components/states';
import NotFound from '../../apps/web/src/app/not-found';
describe('foundation components', () => {
  it('renders the shell with honest preview identity and active navigation', () => {
    render(
      <TooltipProvider>
        <AppShell>
          <ProjectOverview />
        </AppShell>
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('navigation', { name: 'Project navigation' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Preview visitor')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A place for your next discovery.',
    );
    expect(
      screen.getByText('No research data is stored in this preview.'),
    ).toBeVisible();
  });
  it('suppresses disabled button activation', async () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Unavailable
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(click).not.toHaveBeenCalled();
  });
  it('supports modal keyboard close and focus restoration', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open details</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
          <DialogDescription>Preview details.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Open details' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('offers a real retry callback', async () => {
    const retry = vi.fn();
    render(<ErrorState retry={retry} />);
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
