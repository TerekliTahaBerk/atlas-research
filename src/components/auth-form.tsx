"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, safeReturn } from "@/lib/api";
import { Failure, InlineError, Loading, ThemeControl, useResource } from "./ui";
import type { Capabilities } from "@/lib/capabilities";
type Mode = "sign-in" | "sign-up" | "reset" | "reset-new" | "verify";
export function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
function AuthFormInner({ mode }: { mode: Mode }) {
  const needsMail = ["sign-up", "reset", "verify"].includes(mode),
    capabilities = useResource<Capabilities>(
      needsMail ? "/api/capabilities" : null,
    );
  const search = useSearchParams(),
    next = safeReturn(search.get("next"));
  const [busy, setBusy] = useState(false),
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
    <div className="auth-page">
      <header>
        <Link href="/home" className="wordmark">
          Atlas<span>Research</span>
        </Link>
        <ThemeControl />
      </header>
      <main className="auth-card">
        <div className="eyebrow">A place for your next question</div>
        <h1>
          {needsMail && capabilities.data?.emailDelivery === "disabled"
            ? "This service is unavailable"
            : titles[mode]}
        </h1>
        <p>
          {needsMail && capabilities.data?.emailDelivery === "disabled"
            ? "Sign in with an existing account to continue your research."
            : mode === "sign-up"
              ? "A personal research space, with room to work together. Any email address is welcome."
              : "Continue your research in Atlas."}
        </p>
        {needsMail && !capabilities.data ? (
          capabilities.error ? (
            <Failure error={capabilities.error} retry={capabilities.reload} />
          ) : (
            <Loading />
          )
        ) : needsMail && capabilities.data?.emailDelivery === "disabled" ? (
          <div className="notice" role="status">
            <h2>Email delivery is currently unavailable</h2>
            <p>
              New registration, verification emails and password recovery are
              unavailable in this installation. Contact your workspace
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
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {["sign-in", "sign-up", "reset-new"].includes(mode) && (
              <label>
                Password
                <input
                  type="password"
                  aria-label="Password"
                  name="password"
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "sign-in" ? 1 : 12}
                  maxLength={128}
                />
                {mode !== "sign-in" && (
                  <small>Use at least 12 characters.</small>
                )}
              </label>
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
      <footer>Atlas Research · Built for thoughtful work</footer>
    </div>
  );
}
