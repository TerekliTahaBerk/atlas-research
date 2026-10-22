import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MembershipPanel } from '../../apps/web/src/features/platform/membership-panel';

const boundary = vi.hoisted(() => ({ requestData: vi.fn(), mutate: vi.fn() }));
vi.mock('../../apps/web/src/features/platform/client', () => boundary);
vi.mock('../../apps/web/src/features/platform/live-home', () => ({
  buttonClass: '',
  inputClass: '',
}));

it('pages members through one control, preserves retry after failure and deduplicates repeated rows', async () => {
  const user = userEvent.setup();
  const first = {
    profileId: '10000000-0000-4000-8000-000000000001',
    role: 'VIEWER' as const,
    version: 1,
  };
  const second = {
    ...first,
    profileId: '20000000-0000-4000-8000-000000000001',
  };
  const third = { ...first, profileId: '30000000-0000-4000-8000-000000000001' };
  boundary.requestData.mockRejectedValueOnce(
    new Error('Unable to load members. Retry.'),
  );
  boundary.requestData.mockResolvedValueOnce({
    items: [second, third],
    nextCursor: null,
  });
  render(
    <MembershipPanel
      scope="project"
      scopeId="40000000-0000-4000-8000-000000000001"
      capabilities={[]}
      initial={{ items: [first, second], nextCursor: 'signed-cursor' }}
    />,
  );
  expect(screen.getAllByRole('button', { name: 'More members' })).toHaveLength(
    1,
  );
  await user.click(screen.getByRole('button', { name: 'More members' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Retry.');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'More members' }));
  expect(await screen.findByText('Researcher 30000000')).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(
    screen.queryByRole('button', { name: 'More members' }),
  ).not.toBeInTheDocument();
  expect(boundary.mutate).not.toHaveBeenCalled();
});
