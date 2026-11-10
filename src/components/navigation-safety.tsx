"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./ui";
type Guard = {
  label: string;
  pending: (href: string) => boolean;
  flush: () => Promise<boolean>;
  recover?: () => boolean;
  discard?: () => void;
};
const guards = new Map<symbol, Guard>();
export function useNavigationBlocker(guard: Guard) {
  const value = useRef(guard);
  useEffect(() => {
    value.current = guard;
  });
  useEffect(() => {
    const id = Symbol();
    const proxy: Guard = {
      get label() {
        return value.current.label;
      },
      pending: (h) => value.current.pending(h),
      flush: () => value.current.flush(),
      get recover() {
        return value.current.recover;
      },
      get discard() {
        return value.current.discard;
      },
    };
    guards.set(id, proxy);
    return () => {
      guards.delete(id);
    };
  }, []);
}
type Navigate = (href: string, action: () => void) => Promise<boolean>;
const Context = createContext<Navigate>(async (_h, action) => {
  action();
  return true;
});
export const useSafeNavigation = () => useContext(Context);
export function NavigationSafety({ children }: { children: ReactNode }) {
  const router = useRouter(),
    [blocked, setBlocked] = useState<Guard[]>([]),
    [busy, setBusy] = useState(false),
    pending = useRef<{ href: string; action: () => void } | undefined>(
      undefined,
    ),
    working = useRef(false);
  const request = useCallback<Navigate>(async (href, action) => {
    if (working.current || pending.current) return false;
    const checks = [...guards.values()].filter((g) => g.pending(href));
    if (!checks.length) {
      action();
      return true;
    }
    working.current = true;
    setBusy(true);
    window.dispatchEvent(new Event("atlas-navigation-start"));
    const failed: Guard[] = [];
    for (const g of checks) {
      try {
        if (!(await g.flush())) failed.push(g);
      } catch {
        failed.push(g);
      }
    }
    working.current = false;
    setBusy(false);
    if (failed.length) {
      pending.current = { href, action };
      setBlocked(failed);
      return false;
    }
    action();
    return true;
  }, []);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!anchor || anchor.download || anchor.target === "_blank") return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        ![...guards.values()].some((g) =>
          g.pending(url.pathname + url.search + url.hash),
        )
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const href = url.pathname + url.search + url.hash;
      void request(href, () => router.push(href));
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [request, router]);
  useEffect(() => {
    // Preserve Next's state fields. An index lets us restore a blocked Back/Forward
    // before asking to save, then replay that exact browser traversal once approved.
    const push = history.pushState.bind(history),
      replace = history.replaceState.bind(history);
    let index = Number(history.state?.atlasIndex ?? 0),
      href = location.href,
      restoring = false,
      replay = false,
      target: { index: number; href: string } | undefined;
    replace({ ...history.state, atlasIndex: index }, "", location.href);
    history.pushState = (state, unused, url) => {
      index++;
      push({ ...state, atlasIndex: index }, unused, url);
      href = location.href;
    };
    history.replaceState = (state, unused, url) => {
      replace({ ...state, atlasIndex: index }, unused, url);
      href = location.href;
    };
    const pop = (e: PopStateEvent) => {
      const next = e.state?.atlasIndex;
      if (typeof next !== "number") return;
      if (restoring) {
        e.stopImmediatePropagation();
        restoring = false;
        const chosen = target!;
        target = undefined;
        void request(
          new URL(chosen.href).pathname + new URL(chosen.href).search,
          () => {
            replay = true;
            history.go(chosen.index - index);
          },
        );
        return;
      }
      if (replay) {
        replay = false;
        index = next;
        href = location.href;
        return;
      }
      if (
        next !== index &&
        [...guards.values()].some((g) =>
          g.pending(location.pathname + location.search),
        )
      ) {
        e.stopImmediatePropagation();
        target = { index: next, href: location.href };
        restoring = true;
        history.go(index - next);
        return;
      }
      index = next;
      href = location.href;
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("popstate", pop, true);
      history.pushState = push;
      history.replaceState = replace;
      void href;
    };
  }, [request]);
  async function retry() {
    const next = pending.current;
    if (!next) return;
    pending.current = undefined;
    setBlocked([]);
    await request(next.href, next.action);
  }
  function leave() {
    if (!pending.current) return;
    for (const guard of blocked) {
      if (guard.recover && !guard.recover()) return;
      guard.discard?.();
    }
    const next = pending.current;
    pending.current = undefined;
    setBlocked([]);
    next.action();
  }
  return (
    <Context.Provider value={request}>
      {children}
      {busy && (
        <span className="navigation-saving" role="status">
          Saving before leaving…
        </span>
      )}
      {blocked.length > 0 && (
        <Modal
          title="Save before leaving"
          onClose={() => {
            pending.current = undefined;
            setBlocked([]);
          }}
        >
          <p>Your current work has not been acknowledged as saved.</p>
          <ul>
            {blocked.map((g, i) => (
              <li key={i}>{g.label}</li>
            ))}
          </ul>
          <p>
            Stay to review the error or retry saving. A recovered document
            remains private to this account and browser tab.
          </p>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void retry()}
            >
              Retry save and continue
            </button>
            <button
              onClick={() => {
                pending.current = undefined;
                setBlocked([]);
              }}
            >
              Stay and review
            </button>
            {blocked.every((g) => g.recover || g.discard) && (
              <button onClick={leave}>
                {blocked.some((g) => g.discard)
                  ? "Discard unsent AI draft and continue"
                  : "Leave with document recovery"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </Context.Provider>
  );
}
