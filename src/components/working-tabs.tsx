"use client";
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  workLocation,
  workLabel,
  type WorkLocation,
} from "@/lib/work-navigation";
import { Icon, PopoverMenu } from "./ui";
import { useSafeNavigation } from "./navigation-safety";
type Tab = WorkLocation & { title?: string };
const empty: Tab[] = [],
  stores = new Map<string, Tab[]>(),
  listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
let focusAfterClose = "";
export function usePageTitle(title: string) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("atlas-page-title", { detail: title }),
    );
  }, [title]);
}
function publish(user: string, tabs: Tab[]) {
  stores.set(user, tabs);
  try {
    sessionStorage.setItem(
      `atlas-navigation:${user}:v3`,
      JSON.stringify(tabs.map((t) => ({ href: t.href }))),
    );
  } catch {
    window.dispatchEvent(new Event("atlas-tab-storage-failed"));
  }
  listeners.forEach((fn) => fn());
}
export function WorkingTabs({
  userId,
  path,
  title,
  allowedProjects,
  projectBase,
}: {
  userId?: string;
  path: string;
  title: string;
  allowedProjects: string[];
  projectBase?: string | null;
}) {
  const router = useRouter(),
    navigate = useSafeNavigation(),
    nav = useRef<HTMLElement>(null),
    [storageError, setStorageError] = useState(false);
  const tabs = useSyncExternalStore(
      subscribe,
      () => (userId ? (stores.get(userId) ?? empty) : empty),
      () => empty,
    ),
    projectKey = allowedProjects.join(","),
    current = workLocation(path),
    scope = current?.p ? `/w/${current.w}/p/${current.p}` : projectBase;
  const allowed = (t: Tab) =>
    !t.p || allowedProjects.includes(`/w/${t.w}/p/${t.p}`);
  const visible = tabs.filter(
    (t) => allowed(t) && (!t.p || `/w/${t.w}/p/${t.p}` === scope),
  );
  const currentKey = current?.key;
  const currentPresent = visible.some((t) => t.key === currentKey);
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLAnchorElement>(
      '[aria-current="page"]',
    );
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
    if (userId && focusAfterClose === userId + currentKey) {
      active?.focus();
      focusAfterClose = "";
    }
  }, [currentKey, currentPresent, userId]);
  useEffect(() => {
    if (!userId) return;
    function update() {
      let previous = stores.get(userId!);
      if (!previous) {
        try {
          const raw = JSON.parse(
            sessionStorage.getItem(`atlas-navigation:${userId}:v3`) ??
              sessionStorage.getItem(`atlas-navigation:${userId}`) ??
              "[]",
          );
          previous = Array.isArray(raw)
            ? raw.flatMap((v) => {
                const t =
                  typeof v?.href === "string" ? workLocation(v.href) : null;
                return t ? [t] : [];
              })
            : [];
          sessionStorage.removeItem(`atlas-navigation:${userId}`);
        } catch {
          previous = [];
        }
      }
      previous = [...new Map(previous.map((t) => [t.key, t])).values()];
      const valid = previous.filter(
        (t) => !t.p || projectKey.split(",").includes(`/w/${t.w}/p/${t.p}`),
      );
      const active = workLocation(
        location.pathname + location.search + location.hash,
      );
      if (
        active &&
        (!active.p ||
          projectKey.split(",").includes(`/w/${active.w}/p/${active.p}`))
      ) {
        const old = valid.findIndex((t) => t.key === active.key);
        if (old >= 0) valid[old] = { ...valid[old], ...active };
        else
          valid.push({
            ...active,
            title: active.id ? undefined : workLabel(active.kind),
          });
      }
      publish(userId!, valid);
    }
    const rename = (e: Event) => {
      const value = (e as CustomEvent<string>).detail,
        active = workLocation(location.pathname);
      if (typeof value === "string" && active)
        publish(
          userId,
          (stores.get(userId) ?? []).map((t) =>
            t.key === active.key ? { ...t, title: value.slice(0, 300) } : t,
          ),
        );
    };
    const clear = () => publish(userId, []),
      storage = () => setStorageError(true);
    window.addEventListener("atlas-location-changed", update);
    window.addEventListener("atlas-page-title", rename);
    window.addEventListener("atlas-access-changed", clear);
    window.addEventListener("atlas-signed-out", clear);
    window.addEventListener("atlas-tab-storage-failed", storage);
    update();
    return () => {
      window.removeEventListener("atlas-location-changed", update);
      window.removeEventListener("atlas-page-title", rename);
      window.removeEventListener("atlas-access-changed", clear);
      window.removeEventListener("atlas-signed-out", clear);
      window.removeEventListener("atlas-tab-storage-failed", storage);
    };
  }, [userId, path, title, projectKey]);
  const targets = tabs.map((t) => t.href).join("\n");
  useEffect(() => {
    if (!userId || !targets) return;
    const controller = new AbortController();
    const resolve = async () => {
      try {
        const hrefs = targets.split("\n"),
          resolved: Tab[] = [];
        for (let i = 0; i < hrefs.length; i += 20) {
          const params = new URLSearchParams();
          hrefs.slice(i, i + 20).forEach((h) => params.append("href", h));
          const rows = await api<(Tab | null)[]>(
            "/api/navigation/tabs?" + params,
            undefined,
            "GET",
            controller.signal,
          );
          resolved.push(...rows.filter((t): t is Tab => !!t));
        }
        if (!controller.signal.aborted) {
          const keys = new Map(resolved.map((t) => [t.key, t]));
          publish(
            userId,
            (stores.get(userId) ?? []).flatMap((t) =>
              keys.has(t.key)
                ? [{ ...t, ...keys.get(t.key) }]
                : targets.split("\n").includes(t.href)
                  ? []
                  : [t],
            ),
          );
        }
      } catch {
        /* Keep IDs for retry. Private labels are never restored from browser storage. */
      }
    };
    void resolve();
    const timer = setInterval(() => void resolve(), 20000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [targets, userId]);
  function move(key: string, step: number) {
    if (!userId) return;
    const at = visible.findIndex((t) => t.key === key),
      other = visible[at + step];
    if (!other) return;
    const next = [...tabs],
      a = next.findIndex((t) => t.key === key),
      b = next.findIndex((t) => t.key === other.key);
    [next[a], next[b]] = [next[b], next[a]];
    publish(userId, next);
  }
  function close(tab: Tab) {
    if (!userId) return;
    const index = visible.findIndex((t) => t.key === tab.key),
      remaining = tabs.filter((t) => t.key !== tab.key),
      target = visible.filter((t) => t.key !== tab.key)[Math.max(0, index - 1)];
    const finish = () => {
      publish(userId, remaining);
      if (currentKey === tab.key) {
        focusAfterClose = userId + (target?.key ?? "home");
        router.push(target?.href ?? "/home");
      } else
        requestAnimationFrame(() =>
          nav.current
            ?.querySelector<HTMLAnchorElement>('[aria-current="page"]')
            ?.focus(),
        );
    };
    if (currentKey === tab.key) void navigate(target?.href ?? "/home", finish);
    else finish();
  }
  const shown = visible.length
    ? visible
    : current
      ? [{ ...current, title }]
      : [];
  return (
    <>
      <nav ref={nav} className="workspace-tabs" aria-label="Open pages">
        {shown.map((tab) => (
          <span
            className="working-tab"
            key={tab.key}
            data-work-key={tab.key}
            data-active={tab.key === currentKey}
            onKeyDown={(e) => {
              if (
                e.altKey &&
                e.shiftKey &&
                ["ArrowLeft", "ArrowRight"].includes(e.key)
              ) {
                e.preventDefault();
                move(tab.key, e.key === "ArrowLeft" ? -1 : 1);
              }
            }}
          >
            <Link
              href={tab.href}
              aria-current={tab.key === currentKey ? "page" : undefined}
              title={tab.title ?? workLabel(tab.kind)}
            >
              <Icon
                name={
                  tab.kind === "home"
                    ? "home"
                    : tab.kind === "inbox"
                      ? "inbox"
                      : tab.kind === "document" || tab.kind === "documents"
                        ? "note"
                        : tab.kind === "task" || tab.kind === "tasks"
                          ? "check"
                          : tab.kind === "discussion" ||
                              tab.kind === "discussions"
                            ? "discussion"
                            : tab.kind === "library"
                              ? "library"
                              : tab.kind === "source"
                                ? "file"
                                : tab.kind === "settings"
                                  ? "settings"
                                  : "folder"
                }
              />
              <span className="truncate">
                {tab.title ?? workLabel(tab.kind)}
              </span>
            </Link>
            {shown.length > 1 && (
              <button
                className="icon-button"
                aria-label={`Close tab ${tab.title ?? workLabel(tab.kind)}`}
                onClick={() => close(tab)}
              >
                <Icon name="close" />
              </button>
            )}
          </span>
        ))}
      </nav>
      {shown.length > 1 && (
        <PopoverMenu className="action-menu tab-switch-menu">
          <summary className="icon-button" aria-label="Switch open page">
            <Icon name="options" />
          </summary>
          <div>
            {shown.map((tab, i) => (
              <div className="tab-menu-row" key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={tab.key === currentKey ? "page" : undefined}
                >
                  {tab.title ?? workLabel(tab.kind)}
                </Link>
                <button
                  aria-label={`Move tab ${tab.title ?? workLabel(tab.kind)} left`}
                  disabled={!i}
                  onClick={() => move(tab.key, -1)}
                >
                  ←
                </button>
                <button
                  aria-label={`Move tab ${tab.title ?? workLabel(tab.kind)} right`}
                  disabled={i === shown.length - 1}
                  onClick={() => move(tab.key, 1)}
                >
                  →
                </button>
                <button
                  aria-label={`Close page ${tab.title ?? workLabel(tab.kind)}`}
                  onClick={() => close(tab)}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </PopoverMenu>
      )}
      {storageError && (
        <span className="tab-storage-error" role="alert">
          Open tabs remain here; browser tab preferences could not be saved.
        </span>
      )}
    </>
  );
}
