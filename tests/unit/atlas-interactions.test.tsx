import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import { AtlasComposer } from '../../apps/web/src/features/atlas-ai/atlas-composer';
import { SourceCard } from '../../apps/web/src/features/atlas-ai/ai-response';
import { getPickerItems } from '../../apps/web/src/features/atlas-ai/contracts';
import {
  AtlasProvider,
  AssistantExperience,
} from '../../apps/web/src/features/atlas-ai/atlas-provider';
import { ChannelsScreen } from '../../apps/web/src/features/channels/channels-screen';
import { OnboardingPreview } from '../../apps/web/src/features/onboarding/onboarding-preview';
function wrap(children: React.ReactNode) {
  return (
    <TooltipProvider>
      <AtlasProvider>{children}</AtlasProvider>
    </TooltipProvider>
  );
}
describe('Atlas UI interaction boundaries', () => {
  it('attaches a sample mention with the keyboard and removes it accessibly', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(wrap(<AtlasComposer onSubmit={submit} />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    await user.type(input, '@Literature');
    expect(
      screen.getByRole('listbox', { name: 'Mention suggestions' }),
    ).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Remove Literature review' }),
    );
    await user.type(input, 'A question');
    await user.keyboard('{Enter}');
    expect(submit).toHaveBeenCalledWith('A question', []);
  });
  it('moves the active mention and selects the highlighted option', async () => {
    const user = userEvent.setup();
    render(wrap(<AtlasComposer onSubmit={vi.fn()} />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    await user.type(input, '@');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(
      screen.getByRole('button', {
        name: 'Remove Designing for thoughtful human–AI collaboration',
      }),
    ).toBeVisible();
  });
  it('dismisses commands on Escape without submitting or erasing a draft', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(wrap(<AtlasComposer context="document" onSubmit={submit} />));
    const input = screen.getByRole('combobox', { name: 'Ask Atlas' });
    await user.type(input, '/rewrite');
    expect(
      screen.getByRole('listbox', { name: 'Slash commands' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('/rewrite');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it('keeps future entities unavailable and commands specific to context', () => {
    expect(getPickerItems('/', 'latex', 'tasks')).toEqual([]);
    expect(getPickerItems('/', 'latex', 'manuscript')).toHaveLength(1);
    expect(
      getPickerItems('@', 'Datasets', 'global')[0]?.reference?.future,
    ).toBe(true);
  });
  it('never displays verified status without all provenance fields', () => {
    render(
      <SourceCard
        source={{
          id: 'untrusted-status',
          title: 'Incomplete source',
          status: 'verified',
        }}
      />,
    );
    expect(screen.getByText('Unavailable provenance')).toBeVisible();
    expect(screen.queryByText('Verified passage')).not.toBeInTheDocument();
  });
  it('labels the fixed sample answer and treats writes as proposals', async () => {
    const user = userEvent.setup();
    render(wrap(<AssistantExperience request={{ prompt: 'A question' }} />));
    expect(screen.getByText('Prewritten answer · not AI output')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByText('Create task · proposed action')).toBeVisible();
    expect(
      screen.getByText('Preview only: this action cannot execute.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss proposal' }));
    expect(screen.getByText('Prewritten answer · not AI output')).toBeVisible();
  });
  it('adds a clearly local channel message and a local thread reply', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelsScreen />));
    await user.type(
      screen.getByRole('combobox', { name: 'Local channel message' }),
      'A local research thought',
    );
    await user.click(screen.getByRole('button', { name: 'Add local message' }));
    const message = screen
      .getByText('A local research thought')
      .closest('article');
    expect(message).not.toBeNull();
    await user.click(within(message!).getByRole('button', { name: 'Thread' }));
    const thread = screen.getByRole('complementary', {
      name: 'Message thread',
    });
    await user.type(
      within(thread).getByRole('textbox', { name: 'Local reply' }),
      'A local response',
    );
    await user.click(
      within(thread).getByRole('button', { name: 'Add local reply' }),
    );
    expect(
      within(thread).getByText('Preview visitor · A local response'),
    ).toBeVisible();
  });
  it('lets optional onboarding choices be skipped without creating a tenant', async () => {
    const user = userEvent.setup();
    render(wrap(<OnboardingPreview />));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(
      screen.getByRole('radio', { name: 'Independent researcher' }),
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    for (let step = 0; step < 4; step += 1)
      await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Independent researcher')).toBeVisible();
    expect(screen.getByText(/prepared no real account/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Explore the sample workspace' }),
    ).toHaveAttribute('href', '/app/home');
  });
});
