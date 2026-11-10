"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  notificationLabel,
  type InboxItem,
  type InboxPage,
} from "@/lib/inbox-types";
import { Failure, Icon, InlineError, Loading, useResource } from "./ui";
import { displayDate } from "./dashboard-shared";
import { ArtifactCards } from "./collaboration-shared";
type View = {
  status: "all" | "unread";
  event: string;
  selected?: string;
  snapshot?: string;
  cursors: string[];
};
export function InboxExperience({ userId }: { userId: string }) {
  const key = "atlas-inbox-v2:" + userId,
    router = useRouter();
  const [view, setView] = useState<View>(() => {
      try {
        return {
          ...{ status: "unread", event: "all", cursors: [] },
          ...JSON.parse(sessionStorage.getItem(key) ?? "{}"),
        };
      } catch {
        return { status: "unread", event: "all", cursors: [] };
      }
    }),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null),
    restored = useRef(false);
  const params = new URLSearchParams({
    view: "paged",
    status: view.status,
    event: view.event,
    ...(view.selected ? { selected: view.selected } : {}),
    ...(view.snapshot ? { snapshot: view.snapshot } : {}),
    ...(view.cursors.length ? { before: view.cursors.at(-1)! } : {}),
  });
  const data = useResource<InboxPage>(
    "/api/collaboration/inbox?" + params,
    true,
    true,
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(view));
    } catch {}
  }, [key, view]);
  useEffect(() => {
    if (!data.refreshing && data.data && !view.snapshot) {
      const snapshot = data.data.snapshot;
      queueMicrotask(() =>
        setView((v) => (v.snapshot ? v : { ...v, snapshot })),
      );
    }
  }, [data.data, data.refreshing, view.snapshot]);
  useLayoutEffect(() => {
    if (data.data && !restored.current && list.current) {
      restored.current = true;
      try {
        list.current.scrollTop = Number(
          sessionStorage.getItem(key + ":scroll") ?? 0,
        );
      } catch {}
    }
  }, [data.data, key]);
  function change(next: Partial<View>) {
    setView({ ...view, ...next, cursors: [], snapshot: undefined });
    if (list.current) list.current.scrollTop = 0;
    try {
      sessionStorage.setItem(key + ":scroll", "0");
    } catch {}
  }
  async function mark(ids: string[], read = true, open?: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      if (ids.length === 1)
        await api("/api/collaboration/inbox/" + ids[0], { read }, "PATCH");
      else await api("/api/collaboration/inbox", { ids });
      window.dispatchEvent(new Event("atlas-inbox-changed"));
      data.reload();
      if (open) router.push(open);
      else
        setNotice(
          ids.length > 1
            ? "This page marked read."
            : read
              ? "Marked read."
              : "Marked unread.",
        );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const d = data.data,
    selected =
      d && view.selected && d.selected?.id === view.selected
        ? d.selected
        : d?.items.find((n) => n.id === view.selected);
  useEffect(() => {
    if (view.selected && selected?.id === view.selected)
      detailHeading.current?.focus({ preventScroll: true });
  }, [view.selected, selected?.id]);
  function backToList() {
    const id = view.selected;
    setView({ ...view, selected: undefined });
    requestAnimationFrame(() => {
      const row = id
        ? list.current?.querySelector<HTMLButtonElement>(
            `[data-notification="${CSS.escape(id)}"]`,
          )
        : null;
      (row ?? list.current)?.focus({ preventScroll: true });
    });
  }
  const icon = (n: InboxItem) =>
    n.event === "assignment"
      ? "check"
      : n.event === "mention"
        ? "people"
        : "discussion";
  return (
    <div className={`inbox-experience${view.selected ? " has-selection" : ""}`}>
      <header className="inbox-heading">
        <div>
          <h1>Inbox</h1>
          <p>Updates for your research work.</p>
        </div>
        <Link href="/settings?tab=notifications">Notification settings</Link>
      </header>
      <div className="inbox-toolbar">
        <div className="segmented" role="group" aria-label="Inbox view">
          {(["unread", "all"] as const).map((status) => (
            <button
              key={status}
              aria-pressed={view.status === status}
              onClick={() => change({ status })}
            >
              {status === "unread" ? "Unread" : "All"}
            </button>
          ))}
        </div>
        <select
          aria-label="Notification type"
          value={view.event}
          onChange={(e) => change({ event: e.target.value })}
        >
          <option value="all">All types</option>
          <option value="assignment">Assignments</option>
          <option value="reply">Replies</option>
          <option value="mention">Mentions</option>
        </select>
        <button
          disabled={busy || !d?.items.some((n) => !n.readAt) || data.refreshing}
          onClick={() => void mark(d!.items.map((n) => n.id))}
        >
          Mark this page read
        </button>
      </div>
      {!!error && (
        <div className="inbox-action-error">
          <InlineError error={error} />
          <p>Your selection is kept. Try the same action again.</p>
        </div>
      )}
      <span className="sr-only" role="status">
        {notice}
      </span>
      {!!data.error && <Failure error={data.error} retry={data.reload} />}
      {!d ? (
        !data.error && <Loading />
      ) : (
        <>
          <div className="inbox-new-slot">
            <button
              style={{ visibility: d.newCount ? "visible" : "hidden" }}
              disabled={!d.newCount}
              onClick={() => change({})}
            >
              {d.newCount} new update{d.newCount === 1 ? "" : "s"} · Show latest
            </button>
          </div>
          <div className="inbox-panels">
            <section
              className="inbox-list-panel"
              aria-label="Notification list"
              aria-busy={data.refreshing}
            >
              <div
                ref={list}
                className="inbox-list-scroll"
                tabIndex={0}
                onScroll={(e) => {
                  try {
                    sessionStorage.setItem(
                      key + ":scroll",
                      String(e.currentTarget.scrollTop),
                    );
                  } catch {}
                }}
              >
                {!d.items.length ? (
                  <div className="inbox-empty">
                    <Icon name="inbox" />
                    <h2>
                      {view.status === "unread"
                        ? "You’re all caught up"
                        : "No updates in this view"}
                    </h2>
                    <p>
                      Assignments, discussion replies and mentions appear here.
                    </p>
                    {view.cursors.length > 0 && (
                      <button onClick={() => change({})}>
                        Return to latest
                      </button>
                    )}
                  </div>
                ) : (
                  d.items.map((n) => (
                    <button
                      key={n.id}
                      data-notification={n.id}
                      className={`inbox-item ${!n.readAt ? "unread" : ""} ${view.selected === n.id ? "selected" : ""}`}
                      aria-pressed={view.selected === n.id}
                      onClick={() => setView({ ...view, selected: n.id })}
                    >
                      <span className={`inbox-event-icon event-${n.event}`}>
                        <Icon name={icon(n)} />
                      </span>
                      <span className="inbox-item-copy">
                        <span className="inbox-event-label">
                          {notificationLabel(n.event)}
                        </span>
                        <strong>
                          {n.target?.title ?? "Research no longer available"}
                        </strong>
                        <span>
                          {n.target
                            ? (n.sender ?? "Sender not recorded")
                            : "Access may have changed"}
                          {n.projectName ? " · " + n.projectName : ""}
                        </span>
                        <time dateTime={n.createdAt}>
                          {displayDate(n.createdAt)}
                        </time>
                      </span>
                      {!n.readAt && (
                        <span
                          className="inbox-unread-dot"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  ))
                )}
              </div>
              <nav className="inbox-pagination" aria-label="Notification pages">
                <button
                  disabled={!view.cursors.length || data.refreshing}
                  onClick={() => {
                    setView({ ...view, cursors: view.cursors.slice(0, -1) });
                    if (list.current) list.current.scrollTop = 0;
                  }}
                >
                  Previous
                </button>
                <span>
                  Page {view.cursors.length + 1} · {d.total}{" "}
                  {view.status === "unread" ? "unread" : "updates"} in view
                </span>
                <button
                  disabled={!d.next || data.refreshing}
                  onClick={() => {
                    setView({ ...view, cursors: [...view.cursors, d.next!] });
                    if (list.current) list.current.scrollTop = 0;
                  }}
                >
                  Next
                </button>
              </nav>
            </section>
            <section
              className="inbox-detail"
              aria-label="Selected notification"
            >
              <button className="inbox-back" onClick={backToList}>
                ← Back to updates
              </button>
              {!view.selected ? (
                <p className="inbox-detail-placeholder">
                  Select an update to review its context.
                </p>
              ) : !selected ? (
                data.refreshing ? (
                  <Loading />
                ) : (
                  <p>This notification is no longer available.</p>
                )
              ) : (
                <>
                  <div className={`inbox-event-icon event-${selected.event}`}>
                    <Icon name={icon(selected)} />
                  </div>
                  <small>
                    {notificationLabel(selected.event)} ·{" "}
                    {selected.readAt ? "Read" : "Unread"}
                  </small>
                  <h2 ref={detailHeading} tabIndex={-1}>
                    {selected.target?.title ?? "Research no longer available"}
                  </h2>
                  {selected.target ? (
                    <>
                      <p>
                        {selected.sender ?? "Sender not recorded"}
                        {selected.projectName
                          ? " · " + selected.projectName
                          : ""}
                      </p>
                      <p className="inbox-target-kind">
                        {selected.target.kind}
                        {selected.target.archived ? " · Archived" : ""} ·{" "}
                        {displayDate(selected.createdAt)}
                      </p>
                      {selected.excerpt && (
                        <blockquote>{selected.excerpt}</blockquote>
                      )}
                      <ArtifactCards items={selected.links} />
                    </>
                  ) : (
                    <p>
                      The target’s title, message and sender are hidden because
                      it is unavailable to you.
                    </p>
                  )}
                  <div className="actions">
                    {selected.target && (
                      <Link
                        className="button primary"
                        href={selected.target.href}
                        onClick={(e) => {
                          if (
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.altKey
                          ) {
                            void mark([selected.id]);
                            return;
                          }
                          e.preventDefault();
                          void mark([selected.id], true, selected.target!.href);
                        }}
                      >
                        Open{" "}
                        {selected.event === "assignment"
                          ? "task"
                          : selected.target.kind === "discussion"
                            ? "message"
                            : selected.target.kind}
                      </Link>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => void mark([selected.id], !selected.readAt)}
                    >
                      {selected.readAt ? "Mark unread" : "Mark read"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
