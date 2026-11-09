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
import { createPortal } from "react-dom";
import { api, ApiError, message } from "@/lib/api";
export function Icon({
  name,
}: {
  name:
    | "inbox"
    | "discussion"
    | "home"
    | "folder"
    | "plus"
    | "menu"
    | "settings"
    | "arrow"
    | "people"
    | "search"
    | "chevron"
    | "file"
    | "library"
    | "telescope"
    | "new"
    | "grid"
    | "list"
    | "logout"
    | "check"
    | "upload"
    | "download"
    | "book"
    | "note"
    | "panel"
    | "sun"
    | "moon"
    | "tag"
    | "bookmark"
    | "filter"
    | "options"
    | "zoomIn"
    | "zoomOut"
    | "close";
}) {
  const paths = {
    inbox: "M4 3h16l2 12v6H2v-6Zm-2 12h6l2 3h4l2-3h6",
    discussion:
      "M21 15a2 2 0 0 1-2 2H7l-5 4V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2ZM6 7h11M6 11h8",
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
    chevron: "m7 10 5 5 5-5",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6",
    library: "M4 6v14M8 6v14m4-16v16m4-16 4 15",
    telescope: "m6 7 12-4 3 7-12 4ZM6 8 3 9l2 5 3-1m5 0-4 8m4-8 4 8",
    new: "M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M15 3l6 6m-7 6-5 1 1-5 9-9 4 4Z",
    grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    logout: "M9 3H4v18h5m6-14 5 5-5 5m-7-5h12",
    check: "m5 12 4 4L19 6",
    upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
    download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
    book: "M12 6C9 3 4 3 2 4v15c4-1 7-1 10 2m0-15c3-3 8-3 10-2v15c-4-1-7-1-10 2Zm0 0v15",
    note: "M3 3h18v12l-6 6H3Zm12 18v-6h6M7 8h10M7 12h5",
    panel: "M3 4h18v16H3Zm12 0v16",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
    tag: "M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2ZM7 7h.01",
    bookmark: "M5 3h14v18l-7-4-7 4Z",
    filter: "M3 6h18M7 12h10m-7 6h4",
    options: "M12 5h.01M12 12h.01M12 19h.01",
    zoomIn: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M7 10h6m-3-3v6",
    zoomOut: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M7 10h6",
    moon: "M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z",
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
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  dismissible?: boolean;
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
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
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
        {dismissible && (
          <button
            aria-label="Close dialog"
            className="icon-button"
            onClick={() => ref.current?.close()}
          >
            <Icon name="close" />
          </button>
        )}
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
export function ThemeControl({ compact = false }: { compact?: boolean }) {
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
    <button
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Light theme" : "Dark theme"}
      className={compact ? "icon-button" : ""}
    >
      {compact ? (
        <Icon name={dark ? "sun" : "moon"} />
      ) : dark ? (
        "Light theme"
      ) : (
        "Dark theme"
      )}
    </button>
  );
}
export function ToolbarActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const mount = useCallback((node: HTMLSpanElement | null) => {
    if (node) setTarget(document.getElementById("atlas-toolbar-actions"));
  }, []);
  return (
    <>
      <span hidden ref={mount} />
      {target && createPortal(children, target)}
    </>
  );
}
