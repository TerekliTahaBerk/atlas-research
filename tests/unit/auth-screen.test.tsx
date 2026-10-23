import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from '../../apps/web/src/features/onboarding/auth-screen';

const boundary = vi.hoisted(() => ({ requestData: vi.fn() }));
vi.mock('../../apps/web/src/features/platform/client', () => boundary);
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

const original = window.location;
afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: original,
  });
});

describe('live sign-in navigation feedback', () => {
  it('commits the success announcement before the browser starts navigating', async () => {
    boundary.requestData.mockResolvedValue({ redirect: '/app/home' });
    // Capture what assistive technology (and the user) can perceive at the
    // exact moment navigation begins; a later render would be too late.
    let announced: string | null = null;
    let submitDisabled: boolean | null = null;
    const assign = vi.fn(() => {
      announced = screen.getByRole('status').textContent;
      submitDisabled = (
        screen.getByRole('button', {
          name: 'Please wait…',
        }) as HTMLButtonElement
      ).disabled;
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, search: '', hash: '' },
    });
    render(<AuthScreen mode="signin" live />);
    await userEvent.type(screen.getByLabelText('Email'), 'r@atlas.example');
    await userEvent.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(assign).toHaveBeenCalledWith('/app/home');
    expect(announced).toContain('Signed in. Opening your research');
    expect(submitDisabled).toBe(true);
  });

  it('keeps the form usable and explains a failed sign-in', async () => {
    boundary.requestData.mockRejectedValue(
      new Error('Invalid email or password. (request-id)'),
    );
    render(<AuthScreen mode="signin" live />);
    await userEvent.type(screen.getByLabelText('Email'), 'r@atlas.example');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Invalid email or password.',
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
