'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Building2, CircleAlert, Info, MailCheck, SunMoon } from 'lucide-react';
import { z } from 'zod';
import { requestData } from '@/features/platform/client';
import { cn } from '@atlas/ui/lib/utils';
type Mode = 'signin' | 'signup' | 'reset' | 'password';
const copy: Record<Mode, { title: string; sub: string; cta: string }> = {
  password: {
    title: 'Choose a new password',
    sub: 'Use at least 12 characters.',
    cta: 'Update password',
  },
  signin: {
    title: 'Welcome back',
    sub: 'Sign in to continue your research.',
    cta: 'Sign in',
  },
  signup: {
    title: 'Create your Atlas account',
    sub: 'Free for individual researchers. No card required.',
    cta: 'Create account',
  },
  reset: {
    title: 'Reset your password',
    sub: 'We’ll email you a link to choose a new password.',
    cta: 'Send reset link',
  },
};
const links: Record<Mode, { href: string; label: string }[]> = {
  password: [{ href: '/login', label: 'Back to sign in' }],
  signin: [
    { href: '/register', label: 'Create an account' },
    { href: '/reset-password', label: 'Reset password' },
  ],
  signup: [{ href: '/login', label: 'I have an account' }],
  reset: [{ href: '/login', label: 'Back to sign in' }],
};
const inputCls =
  'h-9 rounded-lg border bg-canvas px-[11px] text-[13.5px] text-tx';
/**
 * Shared approved authentication presentation. Explicit preview mode keeps
 * local demonstrations; live mode submits to verified Supabase services.
 */
export function AuthScreen({
  mode,
  live = false,
  google = false,
  notice,
}: {
  mode: Mode;
  live?: boolean;
  google?: boolean;
  notice?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [status, setStatus] = useState<'idle' | 'sent' | 'oauth' | 'error'>(
    'idle',
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(notice ?? '');
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function submit() {
    if (busy) return;
    let redirecting = false;
    setBusy(true);
    setFeedback('');
    setStatus('idle');
    try {
      const result = await requestData(
        '/api/v1/auth',
        z.object({
          message: z.string().optional(),
          redirect: z.string().optional(),
        }),
        {
          action: mode,
          ...(mode !== 'password' ? { email } : {}),
          ...(mode !== 'reset' ? { password } : {}),
          ...(['signup', 'password'].includes(mode) ? { confirmation } : {}),
          ...(mode === 'signup' ? { displayName: name } : {}),
          ...(['signin', 'signup'].includes(mode)
            ? {
                returnTo:
                  new URLSearchParams(window.location.search).get('next') ??
                  '/app/home',
              }
            : {}),
        },
      );
      if (result.redirect) {
        setFeedback(
          mode === 'signin'
            ? 'Signed in. Opening your research…'
            : 'Request completed. Opening the next page…',
        );
        window.location.assign(
          result.redirect +
            (result.redirect === '/invite' ? window.location.hash : ''),
        );
        redirecting = true;
      } else {
        setFeedback(result.message ?? 'Request completed.');
        setStatus('sent');
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Request failed. Try again.',
      );
      setStatus('error');
    } finally {
      if (!redirecting) setBusy(false);
      setPassword('');
      setConfirmation('');
    }
  }
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const ids = { name: useId(), email: useId(), password: useId() };
  const c = copy[mode];
  return (
    <div className="flex min-h-dvh flex-col overflow-auto bg-canvas text-tx">
      <header className="flex items-center gap-2 px-5 py-4">
        <span
          aria-hidden="true"
          className="grid size-[22px] place-items-center rounded-[5px] bg-acb font-serif text-base font-semibold text-white"
        >
          A
        </span>
        <span className="font-serif text-xl font-medium">Atlas</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov"
        >
          <SunMoon aria-hidden="true" className="size-[14px]" />
        </button>
        <Link
          href="/app/home"
          className="h-7 rounded-md px-2.5 text-ctl leading-7 text-tx2 hover:bg-hov"
        >
          {live ? 'Home' : 'Exit preview'}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-[360px]">
          <h1 className="mb-1.5 font-serif text-[34px] leading-[1.1] font-medium">
            {c.title}
          </h1>
          <p className="mb-6 text-ui text-tx2">{c.sub}</p>
          {mode !== 'reset' && mode !== 'password' ? (
            <>
              <div className="mb-[18px] flex flex-col gap-2">
                {[
                  {
                    label: 'Continue with Google',
                    mark: <span className="text-sm font-semibold">G</span>,
                  },
                  {
                    label: 'Continue with ORCID',
                    mark: (
                      <span className="rounded-[3px] border border-tx2 px-[3px] py-px text-[11px] font-semibold">
                        iD
                      </span>
                    ),
                  },
                  {
                    label: 'Institution SSO',
                    mark: (
                      <Building2 aria-hidden="true" className="size-[14px]" />
                    ),
                  },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    disabled={
                      live && (o.label !== 'Continue with Google' || !google)
                    }
                    title={
                      live && (o.label !== 'Continue with Google' || !google)
                        ? 'Provider is not configured'
                        : undefined
                    }
                    onClick={async () => {
                      if (!live) {
                        setStatus('oauth');
                        return;
                      }
                      setBusy(true);
                      try {
                        const result = await requestData(
                          '/api/v1/auth',
                          z.object({ redirect: z.string() }),
                          {
                            action: 'google',
                            returnTo:
                              new URLSearchParams(window.location.search).get(
                                'next',
                              ) ?? '/app/home',
                          },
                        );
                        window.location.assign(result.redirect);
                      } catch (error) {
                        setFeedback(
                          error instanceof Error
                            ? error.message
                            : 'Sign-in failed.',
                        );
                        setStatus('error');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="flex h-[38px] items-center justify-center gap-[9px] rounded-lg border border-bd bg-el font-medium hover:bg-hov"
                  >
                    <span aria-hidden="true">{o.mark}</span>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mb-4 flex items-center gap-2.5 text-[11.5px] text-tx3">
                <span className="h-px flex-1 bg-bd2" />
                or with email
                <span className="h-px flex-1 bg-bd2" />
              </div>
            </>
          ) : null}
          <form
            noValidate={!live}
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (live) {
                void submit();
                return;
              }
              setPassword('');
              setStatus(
                mode === 'signin' && !email.includes('@') ? 'error' : 'sent',
              );
            }}
          >
            {mode === 'signup' ? (
              <label
                htmlFor={ids.name}
                className="flex flex-col gap-[5px] text-xs text-tx2"
              >
                Full name
                <input
                  id={ids.name}
                  autoComplete="name"
                  maxLength={live ? 120 : undefined}
                  required={live}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Taha Berk Terekli"
                  className={cn(inputCls, 'border-bd')}
                />
              </label>
            ) : null}
            {mode !== 'password' ? (
              <label
                htmlFor={ids.email}
                className="flex flex-col gap-[5px] text-xs text-tx2"
              >
                Email
                <input
                  id={ids.email}
                  required={live}
                  type="email"
                  autoComplete="email"
                  maxLength={live ? 254 : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  aria-invalid={status === 'error' || undefined}
                  className={cn(
                    inputCls,
                    status === 'error' ? 'border-danger' : 'border-bd',
                  )}
                />
              </label>
            ) : null}
            {mode !== 'reset' ? (
              <div className="flex flex-col gap-[5px] text-xs text-tx2">
                <span className="flex">
                  <label htmlFor={ids.password}>Password</label>
                  <span className="flex-1" />
                  {mode === 'signin' ? (
                    <Link
                      href="/reset-password"
                      className="text-xs text-actx hover:underline"
                    >
                      Forgot?
                    </Link>
                  ) : null}
                </span>
                <input
                  id={ids.password}
                  required={live}
                  minLength={live && mode !== 'signin' ? 12 : undefined}
                  maxLength={live ? 128 : undefined}
                  type="password"
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn(
                    inputCls,
                    status === 'error' ? 'border-danger' : 'border-bd',
                  )}
                />
                {live && mode !== 'signin' ? (
                  <span>Use 12–128 characters.</span>
                ) : null}
              </div>
            ) : null}
            {live && (mode === 'signup' || mode === 'password') ? (
              <label className="flex flex-col gap-[5px] text-xs text-tx2">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className={cn(inputCls, 'border-bd')}
                />
              </label>
            ) : null}
            <div role="status" aria-live="polite">
              {live && feedback ? (
                <p
                  className={cn(
                    'text-xs',
                    status === 'error' ? 'text-danger' : 'text-actx',
                  )}
                >
                  {feedback}
                </p>
              ) : null}
              {!live && status === 'error' ? (
                <p className="flex items-start gap-[7px] text-xs text-danger">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-px size-[13px] shrink-0"
                  />
                  Enter a valid email address. (Sample validation — no
                  credentials are checked.)
                </p>
              ) : null}
              {!live && status === 'sent' ? (
                <p className="flex items-start gap-[7px] text-xs text-actx">
                  {mode === 'reset' ? (
                    <MailCheck
                      aria-hidden="true"
                      className="mt-px size-[13px] shrink-0"
                    />
                  ) : (
                    <Info
                      aria-hidden="true"
                      className="mt-px size-[13px] shrink-0"
                    />
                  )}
                  {mode === 'reset'
                    ? 'Preview only — no reset email was sent.'
                    : mode === 'signup'
                      ? 'Preview only — no account was created and no authentication request was sent.'
                      : 'Preview only — no authentication request was sent.'}
                </p>
              ) : null}
              {!live && status === 'oauth' ? (
                <p className="flex items-start gap-[7px] text-xs text-tx2">
                  <Info
                    aria-hidden="true"
                    className="mt-px size-[13px] shrink-0"
                  />
                  OAuth isn’t connected in this preview. Identity arrives in
                  Phase 01.
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-10 rounded-lg bg-tx text-[13.5px] font-medium text-canvas hover:opacity-90"
            >
              {busy ? 'Please wait…' : c.cta}
            </button>
          </form>
          <div className="mt-5 flex justify-center gap-4 text-ctl text-tx2">
            {links[mode].map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-tx">
                {l.label}
              </Link>
            ))}
            {!live && mode === 'signup' ? (
              <Link href="/onboarding" className="hover:text-tx">
                See onboarding
              </Link>
            ) : null}
          </div>
          <p className="mt-7 text-center text-[11px] text-tx3">
            {live
              ? 'Passwords are handled by Supabase Auth. Unavailable identity providers are disabled.'
              : 'Preview — no account is created and nothing is stored.'}
          </p>
        </div>
      </main>
    </div>
  );
}
