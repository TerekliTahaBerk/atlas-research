'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Compass, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Input } from '@atlas/ui/components/input';
import { ThemeControl } from '@/components/theme-control';
import { PreviewNotice } from '@/features/preview/primitives';
export function AuthPreview({
  mode,
}: {
  mode: 'login' | 'register' | 'reset';
}) {
  const [visible, setVisible] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const title =
    mode === 'login'
      ? 'Welcome back to Atlas.'
      : mode === 'register'
        ? 'A home for your next idea.'
        : 'Find your way back.';
  return (
    <div className="auth-page">
      <header>
        <Link href="/" className="wordmark">
          <Compass aria-hidden="true" />
          <span>ATLAS</span>
        </Link>
        <ThemeControl />
      </header>
      <main className="auth-form">
        <Compass className="auth-mark" aria-hidden="true" />
        <h1>{title}</h1>
        <p>
          {mode === 'reset'
            ? 'A calm path back to your research.'
            : 'Your research, connected. Your thinking, uninterrupted.'}
        </p>
        <PreviewNotice phase="01">
          Authentication design preview · no account, password, or recovery
          email is submitted or saved.
        </PreviewNotice>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            e.currentTarget.reset();
            setReviewed(true);
          }}
        >
          <label htmlFor="auth-email">Email</label>
          <Input
            id="auth-email"
            type="email"
            placeholder="name@institution.edu"
            autoComplete="off"
            required
          />
          {mode !== 'reset' ? (
            <>
              <label htmlFor="auth-password">Password</label>
              <div className="password-input">
                <Input
                  id="auth-password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="Password field preview"
                  minLength={8}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible((prev) => !prev)}
                >
                  {visible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
            </>
          ) : null}
          <Button type="submit">
            {mode === 'login'
              ? 'Preview sign in'
              : mode === 'register'
                ? 'Preview account creation'
                : 'Preview recovery'}
          </Button>
          {reviewed ? (
            <p className="draft-review" role="status">
              Form reviewed locally. No authentication request was sent. Fields
              have been cleared.
            </p>
          ) : null}
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <Link href="/reset-password">Forgot password?</Link>
              <p>
                New to Atlas? <Link href="/register">Explore sign up</Link>
              </p>
            </>
          ) : (
            <Link href="/login">Back to sign in preview</Link>
          )}
          <Link href="/onboarding">Explore onboarding preview →</Link>
          <Link href="/app">
            <ArrowLeft aria-hidden="true" />
            Back to workspace
          </Link>
        </div>
      </main>
      <footer>Design preview · Phase 00.5</footer>
    </div>
  );
}
