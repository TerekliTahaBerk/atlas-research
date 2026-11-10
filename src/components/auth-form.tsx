"use client";
import { Suspense, useId, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, safeReturn } from "@/lib/api";
import { Failure, InlineError, Loading, ThemeControl, useResource } from "./ui";
import type { Capabilities } from "@/lib/capabilities";
import { PublicBrand } from "./public-brand";
import { AuthEvidence } from "./public-site";
type Mode = "sign-in" | "sign-up" | "reset" | "reset-new" | "verify";
export function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
function AuthFormInner({ mode }: { mode: Mode }) {
  const passwordId = useId();
  const needsMail = ["sign-up", "reset", "verify"].includes(mode),
    capabilities = useResource<Capabilities>(
      needsMail ? "/api/capabilities" : null,
    );
  const search = useSearchParams(),
    next = safeReturn(search.get("next"));
  const [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const titles = {
    "sign-in": "Welcome back",
    "sign-up": "Create your account",
    reset: "Reset your password",
    "reset-new": "Choose a new password",
    verify: "Check your inbox",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget),
      email = String(data.get("email")),
      password = String(data.get("password"));
    const query = new URLSearchParams(location.search),
      next = safeReturn(query.get("next"));
    try {
      if (mode === "sign-in") {
        await api("/api/auth/sign-in/email", { email, password });
        location.assign(next);
        return;
      }
      if (mode === "sign-up") {
        await api("/api/auth/sign-up/email", {
          email,
          password,
          name: String(data.get("name")),
          callbackURL:
            location.origin +
            "/sign-in?verified=1&next=" +
            encodeURIComponent(next),
        });
        setNotice(
          "If this address can be registered, a verification email is on its way. Verify your email, then sign in.",
        );
      }
      if (mode === "reset") {
        await api("/api/auth/request-password-reset", {
          email,
          redirectTo: location.origin + "/reset/new",
        });
        setNotice(
          "If an account matches that address, a reset link is on its way. Check your inbox.",
        );
      }
      if (mode === "reset-new") {
        await api("/api/auth/reset-password", {
          newPassword: password,
          token: query.get("token") ?? "",
        });
        setNotice("Your password was changed. Sign in with your new password.");
      }
      if (mode === "verify") {
        await api("/api/auth/send-verification-email", {
          email,
          callbackURL:
            location.origin +
            "/sign-in?verified=1&next=" +
            encodeURIComponent(next),
        });
        setNotice(
          "If eligible, a new verification email is on its way. Check your inbox.",
        );
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page public-auth atlas-auth-v2">
      <header>
        <PublicBrand />
        <ThemeControl />
      </header>
      <div className="public-auth-stage">
        <aside className="auth-story">
          <div>
            <span className="public-kicker">THE SOURCE, IN SIGHT</span>
            <h2>
              A quieter place
              <br />
              to think.
            </h2>
            <p>
              Papers, notes and next steps — together, with the source in sight.
            </p>
          </div>
          <AuthEvidence />
          <span className="auth-story-caption">
            Your reading. Your thinking. Connected.
          </span>
        </aside>
        <div className="auth-form-region">
          <main className="auth-card">
            <h1>
              {needsMail && capabilities.data?.emailDelivery === "disabled"
                ? "This service is unavailable"
                : titles[mode]}
            </h1>
            {mode === "sign-in" && (
              <p className="auth-description">
                Sign in to your research workspace.
              </p>
            )}
            {mode !== "sign-in" && (
              <p className="auth-description">
                {needsMail && capabilities.data?.emailDelivery === "disabled"
                  ? "Sign in with an existing account to continue your research."
                  : mode === "sign-up"
                    ? "A personal research space, with room to work together. Any email address is welcome."
                    : "Continue your research in Atlas."}
              </p>
            )}
            {needsMail && !capabilities.data ? (
              capabilities.error ? (
                <Failure
                  error={capabilities.error}
                  retry={capabilities.reload}
                />
              ) : (
                <Loading />
              )
            ) : needsMail && capabilities.data?.emailDelivery === "disabled" ? (
              <div className="notice" role="status">
                <h2>Email delivery is currently unavailable</h2>
                <p>
                  New registration, verification emails and password recovery
                  are unavailable in this installation. Contact your workspace
                  administrator.
                </p>
              </div>
            ) : notice ? (
              <div role="status" className="notice">
                <p>{notice}</p>
                <Link
                  className="button primary"
                  href={`/sign-in?next=${encodeURIComponent(next)}`}
                >
                  Go to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} aria-busy={busy}>
                {mode === "sign-up" && (
                  <label>
                    Name
                    <input
                      name="name"
                      placeholder="Your full name"
                      autoComplete="name"
                      required
                      maxLength={80}
                    />
                  </label>
                )}
                {mode !== "reset-new" && (
                  <label>
                    Email
                    <input
                      type="email"
                      placeholder="Enter your email"
                      name="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  </label>
                )}
                {["sign-in", "sign-up", "reset-new"].includes(mode) && (
                  <div className="auth-password-group">
                    <label htmlFor={passwordId}>Password</label>
                    <span className="auth-password-field">
                      <input
                        id={passwordId}
                        type={showPassword ? "text" : "password"}
                        placeholder={
                          mode === "sign-in"
                            ? "Enter your password"
                            : "Choose a password"
                        }
                        aria-label="Password"
                        name="password"
                        autoComplete={
                          mode === "sign-in"
                            ? "current-password"
                            : "new-password"
                        }
                        required
                        minLength={mode === "sign-in" ? 1 : 12}
                        maxLength={128}
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                          {showPassword && <path d="m3 3 18 18" />}
                        </svg>
                      </button>
                    </span>
                    {mode !== "sign-in" && (
                      <small>Use at least 12 characters.</small>
                    )}
                  </div>
                )}
                <InlineError error={error} />
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "sign-in"
                      ? "Sign in"
                      : mode === "sign-up"
                        ? "Create account"
                        : mode === "reset-new"
                          ? "Save new password"
                          : mode === "verify"
                            ? "Resend verification email"
                            : "Send reset link"}
                </button>
              </form>
            )}
            <div className="auth-links">
              {mode === "sign-in" ? (
                <>
                  <Link href="/reset">Forgot password?</Link>
                  <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>
                    Create an account
                  </Link>
                  <Link href={`/verify?next=${encodeURIComponent(next)}`}>
                    Resend verification
                  </Link>
                </>
              ) : (
                <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>
                  Back to sign in
                </Link>
              )}
            </div>
            {mode === "sign-up" &&
              capabilities.data?.emailDelivery !== "disabled" && (
                <p className="footnote">
                  Your account starts with an empty, private workspace.
                </p>
              )}
          </main>
          <p className="auth-form-footer">
            <Link href="/">Back to Atlas</Link>
            <span>Research, with the source in sight.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
