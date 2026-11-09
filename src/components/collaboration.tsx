"use client";
import { DiscussionsExperience } from "./discussions-experience";
import { TasksExperience } from "./tasks-experience";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ArtifactCard } from "@/lib/collaboration-types";
import { WorkspaceShell } from "./workspace-shell";
import { Failure, InlineError, Loading, Icon, useResource } from "./ui";
export function CollaborationScreen({
  w,
  p,
  mode,
  id,
}: {
  w: string;
  p: string;
  mode: "tasks" | "discussions";
  id?: string;
}) {
  return (
    <WorkspaceShell
      title={mode === "tasks" ? "Tasks" : "Discussions"}
      surface={mode}
    >
      {({ me }) =>
        mode === "tasks" ? (
          <TasksExperience
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            userId={me.user.id}
            initialId={id}
          />
        ) : (
          <DiscussionsExperience
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            id={id}
            userId={me.user.id}
          />
        )
      }
    </WorkspaceShell>
  );
}
type InboxItem = {
  id: string;
  event: string;
  readAt: string | null;
  createdAt: string;
  target: ArtifactCard | null;
};
export function InboxScreen() {
  return (
    <WorkspaceShell title="Inbox" surface="inbox">
      {() => <Inbox />}
    </WorkspaceShell>
  );
}
function Inbox() {
  const data = useResource<InboxItem[]>("/api/collaboration/inbox"),
    [filter, setFilter] = useState<"all" | "unread">("unread"),
    [error, setError] = useState<unknown>();
  async function mark(id: string, read: boolean) {
    try {
      await api("/api/collaboration/inbox/" + id, { read }, "PATCH");
      window.dispatchEvent(new Event("atlas-inbox-changed"));
      data.reload();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="collab-list-page inbox-page">
      <div className="collab-list-heading">
        <h1>Inbox</h1>
        <div className="segmented">
          <button
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread
          </button>
          <button
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>
      </div>
      <InlineError error={error} />
      {data.error ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : (
        <div className="collab-rows">
          {!data.data.filter((n) => filter === "all" || !n.readAt).length && (
            <div className="empty">
              <Icon name="check" />
              <h2>You’re all caught up</h2>
              <p>Assignments, replies and mentions appear here.</p>
            </div>
          )}
          {data.data
            .filter((n) => filter === "all" || !n.readAt)
            .map((n) => (
              <article
                key={n.id}
                className={"inbox-row " + (!n.readAt ? "unread" : "")}
              >
                <span className="status-dot" />
                <div>
                  <small>
                    {n.event === "assignment"
                      ? "Task assignment"
                      : n.event === "mention"
                        ? "You were mentioned"
                        : "Discussion reply"}{" "}
                    · {new Date(n.createdAt).toLocaleString()}
                  </small>
                  {n.target ? (
                    <Link
                      href={n.target.href}
                      onClick={() => void mark(n.id, true)}
                    >
                      {n.target.title}
                      {n.target.archived ? " · archived" : ""}
                    </Link>
                  ) : (
                    <span>Target unavailable · access may have changed</span>
                  )}
                  {n.target && (
                    <small className="inbox-next">
                      {n.event === "assignment"
                        ? "Review your assigned task"
                        : n.event === "mention"
                          ? "Open the mentioned research"
                          : "Read the latest reply"}
                    </small>
                  )}
                </div>
                <button onClick={() => void mark(n.id, !n.readAt)}>
                  {n.readAt ? "Mark unread" : "Mark read"}
                </button>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
