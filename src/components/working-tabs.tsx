"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, PopoverMenu } from "./ui";
type Tab = { path: string; href: string; title: string };
const empty: Tab[] = [];
const stores = new Map<string, Tab[]>();
const listeners = new Set<() => void>();
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
    sessionStorage.setItem(`atlas-navigation:${user}`, JSON.stringify(tabs));
  } catch {}
  listeners.forEach((fn) => fn());
}
export function WorkingTabs({
  userId,
  path,
  title,
  allowedProjects,
}: {
  userId?: string;
  path: string;
  title: string;
  allowedProjects: string[];
}) {
  const router = useRouter();
  const nav = useRef<HTMLElement>(null);
  const tabs = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (userId ? (stores.get(userId) ?? empty) : empty),
    () => empty,
  );
  const projectKey = allowedProjects.join(",");
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLAnchorElement>(
      '[aria-current="page"]',
    );
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
    if (userId && focusAfterClose === userId + path) {
      active?.focus();
      focusAfterClose = "";
    }
  }, [path, tabs, userId]);
  useEffect(() => {
    if (!userId) return;
    function update() {
      let previous = stores.get(userId!) ?? [];
      if (!previous.length)
        try {
          previous = JSON.parse(
            sessionStorage.getItem(`atlas-navigation:${userId}`) ?? "[]",
          );
        } catch {}
      const valid = Array.isArray(previous)
        ? previous.filter(
            (t) =>
              t &&
              typeof t.path === "string" &&
              typeof t.title === "string" &&
              typeof t.href === "string" &&
              t.href.startsWith(t.path) &&
              (t.path === "/home" ||
                t.path === "/inbox" ||
                t.path === "/settings" ||
                t.path === "/help" ||
                projectKey
                  .split(",")
                  .some(
                    (base) =>
                      base &&
                      (t.path === base || t.path.startsWith(base + "/")),
                  )),
          )
        : [];
      const next = valid.filter((t) => t.path !== path);
      next.push({
        path,
        href: location.pathname + location.search + location.hash,
        title: ["Document", "Tasks", "Discussions", "Library"].includes(title)
          ? (valid.find((t) => t.path === path)?.title ?? title)
          : title,
      });
      publish(userId!, next.slice(-10));
    }
    update();
    const rename = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (typeof value === "string")
        publish(
          userId,
          (stores.get(userId) ?? []).map((t) =>
            t.path === path ? { ...t, title: value.slice(0, 300) } : t,
          ),
        );
    };
    const clear = () => publish(userId, []);
    window.addEventListener("atlas-location-changed", update);
    window.addEventListener("atlas-page-title", rename);
    window.addEventListener("atlas-access-changed", clear);
    window.addEventListener("atlas-signed-out", clear);
    return () => {
      window.removeEventListener("atlas-page-title", rename);
      window.removeEventListener("atlas-location-changed", update);
      window.removeEventListener("atlas-access-changed", clear);
      window.removeEventListener("atlas-signed-out", clear);
    };
  }, [userId, path, title, projectKey]);
  return (
    <>
      <nav ref={nav} className="workspace-tabs" aria-label="Open pages">
        {(tabs.length ? tabs : [{ path, href: path, title }]).map((tab) => (
          <span
            className="working-tab"
            key={tab.path}
            data-active={tab.path === path}
          >
            <Link
              href={tab.href}
              aria-current={tab.path === path ? "page" : undefined}
              title={tab.title}
            >
              <Icon
                name={
                  tab.path === "/home"
                    ? "home"
                    : tab.path.includes("/docs")
                      ? "note"
                      : tab.path.includes("/tasks")
                        ? "check"
                        : tab.path.includes("/discussions")
                          ? "discussion"
                          : tab.path.includes("/discover")
                            ? "telescope"
                            : tab.path.includes("/sources")
                              ? "file"
                              : "folder"
                }
              />
              <span className="truncate">{tab.title}</span>
            </Link>
            {tabs.length > 1 && (
              <button
                className="icon-button"
                aria-label={`Close tab ${tab.title}`}
                onClick={() => {
                  if (!userId) return;
                  const index = tabs.findIndex((t) => t.path === tab.path),
                    next = tabs.filter((t) => t.path !== tab.path);
                  publish(userId, next);
                  if (path === tab.path) {
                    const target = next[Math.max(0, index - 1)];
                    focusAfterClose = userId + (target?.path ?? "/home");
                    router.push(target?.href ?? "/home");
                  } else
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLAnchorElement>(
                          '.working-tab[data-active="true"] a',
                        )
                        ?.focus(),
                    );
                }}
              >
                <Icon name="close" />
              </button>
            )}
          </span>
        ))}
      </nav>
      {tabs.length > 1 && (
        <PopoverMenu className="action-menu tab-switch-menu">
          <summary className="icon-button" aria-label="Switch open page">
            <Icon name="options" />
          </summary>
          <div>
            {tabs.map((tab) => (
              <Link
                key={tab.path}
                href={tab.href}
                aria-current={tab.path === path ? "page" : undefined}
              >
                {tab.title}
              </Link>
            ))}
          </div>
        </PopoverMenu>
      )}
    </>
  );
}
