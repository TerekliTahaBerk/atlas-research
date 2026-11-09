"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { api, ApiError, message } from "@/lib/api";
export function Icon({
  name,
}: {
  name:
    | "home"
    | "folder"
    | "plus"
    | "menu"
    | "settings"
    | "arrow"
    | "people"
    | "search"
    | "close";
}) {
  const paths = {
    home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    folder: "M3 7V5h6l2 2h10v13H3Z",
    plus: "M12 5v14M5 12h14",
    menu: "M4 5h16v14H4ZM9 5v14",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8",
    close: "m6 6 12 12M6 18 18 6",
    search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  };
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function useResource<T>(url: string | null) {
  const [state, setState] = useState<{
      url: string;
      data?: T;
      error?: unknown;
    }>(),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let inFlight = false,
      denied = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api<T>(url, undefined, "GET", controller.signal);
        if (!controller.signal.aborted) setState({ url, data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ url, error });
          if (
            !denied &&
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          ) {
            denied = true;
            window.dispatchEvent(new Event("atlas-access-changed"));
          }
        }
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 20_000);
    window.addEventListener("focus", load);
    window.addEventListener("atlas-access-changed", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("atlas-access-changed", load);
    };
  }, [url, revision]);
  return {
    data: state?.url === url ? state.data : undefined,
    error: state?.url === url ? state.error : undefined,
    reload,
  };
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="skeleton" />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const login = error instanceof ApiError && error.status === 401;
  return (
    <section className="empty" role="alert">
      <h2>{login ? "Sign in to continue" : "This page is unavailable"}</h2>
      <p>
        {login
          ? "Your session may have expired."
          : "It may have moved, or your access may have changed."}
      </p>
      {error instanceof ApiError && error.requestId && (
        <small>Reference: {error.requestId}</small>
      )}
      <div className="actions">
        {login ? (
          <a
            className="button primary"
            href={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            Sign in
          </a>
        ) : (
          <button onClick={retry}>Try again</button>
        )}
        <Link href="/home">Back to Home</Link>
      </div>
    </section>
  );
}
export function InlineError({ error }: { error: unknown }) {
  return error ? (
    <p className="error" role="alert">
      {message(error)}{" "}
      {error instanceof ApiError && error.code === "REAUTH_REQUIRED" && (
        <a href={`/sign-in?next=${encodeURIComponent(location.pathname)}`}>
          Sign in again
        </a>
      )}
    </p>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const node = ref.current;
    const opener = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={drawer ? "drawer" : "modal"}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ].filter((e) => e.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={() => ref.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function subscribeTheme(listener: () => void) {
  window.addEventListener("atlas-theme", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("atlas-theme", listener);
    window.removeEventListener("storage", listener);
  };
}
const themeSnapshot = () => document.documentElement.dataset.theme === "dark";
export function ThemeControl() {
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false);
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("atlas-theme", next ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event("atlas-theme"));
  }
  return (
    <button onClick={toggle} aria-pressed={dark}>
      {dark ? "Light theme" : "Dark theme"}
    </button>
  );
}
