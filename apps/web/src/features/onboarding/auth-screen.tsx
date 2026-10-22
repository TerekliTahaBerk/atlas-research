'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Building2, CircleAlert, Info, MailCheck, SunMoon } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
type Mode = 'signin' | 'signup' | 'reset';
const copy: Record<Mode, { title: string; sub: string; cta: string }> = {
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
 * Authentication previews (prototype auth overlay). Forms never submit to a
 * server: Phase 01 replaces them with verified Supabase flows.
 */
export function AuthScreen({ mode }: { mode: Mode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [status, setStatus] = useState<'idle' | 'sent' | 'oauth' | 'error'>(
    'idle',
  );
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
          Exit preview
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-[360px]">
          <h1 className="mb-1.5 font-serif text-[34px] leading-[1.1] font-medium">
            {c.title}
          </h1>
          <p className="mb-6 text-ui text-tx2">{c.sub}</p>
          {mode !== 'reset' ? (
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
                    onClick={() => setStatus('oauth')}
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
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
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
                  placeholder="Taha Berk Terekli"
                  className={cn(inputCls, 'border-bd')}
                />
              </label>
            ) : null}
            <label
              htmlFor={ids.email}
              className="flex flex-col gap-[5px] text-xs text-tx2"
            >
              Email
              <input
                id={ids.email}
                type="email"
                autoComplete="email"
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
              </div>
            ) : null}
            <div role="status" aria-live="polite">
              {status === 'error' ? (
                <p className="flex items-start gap-[7px] text-xs text-danger">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-px size-[13px] shrink-0"
                  />
                  Enter a valid email address. (Sample validation — no
                  credentials are checked.)
                </p>
              ) : null}
              {status === 'sent' ? (
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
              {status === 'oauth' ? (
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
              className="mt-1 h-10 rounded-lg bg-tx text-[13.5px] font-medium text-canvas hover:opacity-90"
            >
              {c.cta}
            </button>
          </form>
          <div className="mt-5 flex justify-center gap-4 text-ctl text-tx2">
            {links[mode].map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-tx">
                {l.label}
              </Link>
            ))}
            {mode === 'signup' ? (
              <Link href="/onboarding" className="hover:text-tx">
                See onboarding
              </Link>
            ) : null}
          </div>
          <p className="mt-7 text-center text-[11px] text-tx3">
            Preview — no account is created and nothing is stored.
          </p>
        </div>
      </main>
    </div>
  );
}
