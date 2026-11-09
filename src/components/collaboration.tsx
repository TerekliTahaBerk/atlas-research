"use client";
import { TasksExperience } from "./tasks-experience";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  ArtifactCard,
  DiscussionData,
  MessageData,
  Member,
} from "@/lib/collaboration-types";
import { WorkspaceShell } from "./workspace-shell";
import { usePageTitle } from "./working-tabs";
import {
  Failure,
  InlineError,
  Loading,
  ToolbarActions,
  Icon,
  useResource,
} from "./ui";
import {
  ArtifactCards,
  CreateArtifactDialog,
  LinkPicker,
  collabApi,
  collabPath,
} from "./collaboration-shared";
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
        ) : id ? (
          <Discussion key={id} w={w} p={p} id={id} userId={me.user.id} />
        ) : (
          <Discussions w={w} p={p} />
        )
      }
    </WorkspaceShell>
  );
}
function Discussions({ w, p }: { w: string; p: string }) {
  const data = useResource<{ items: DiscussionData[]; canEdit: boolean }>(
      collabApi(w, p) + "/discussions",
    ),
    [creating, setCreating] = useState(false);
  return (
    <div className="collab-list-page">
      <ToolbarActions>
        {data.data?.canEdit && (
          <button className="toolbar-button" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New discussion
          </button>
        )}
      </ToolbarActions>
      <div className="collab-list-heading">
        <h1>Discussions</h1>
      </div>
      {data.error ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : (
        <div className="collab-rows">
          {!data.data.items.length && (
            <div className="empty">
              <Icon name="people" />
              <h2>Discuss your research</h2>
              <p>Start a topic from a document, task or source.</p>
              {data.data.canEdit && (
                <button onClick={() => setCreating(true)}>
                  New discussion
                </button>
              )}
            </div>
          )}
          {data.data.items.map((d) => (
            <Link
              key={d.id}
              className="collab-row"
              href={collabPath(w, p) + "/discussions/" + d.id}
            >
              <Icon name="people" />
              <span>
                <strong>{d.title}</strong>
                <small>{new Date(d.updatedAt).toLocaleString()}</small>
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind="discussion"
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
function Discussion({
  w,
  p,
  id,
  userId,
}: {
  w: string;
  p: string;
  id: string;
  userId: string;
}) {
  const draftKey = `atlas-reply:${userId}:${w}:${p}:${id}`;
  const [restored] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (
        value &&
        Date.now() - value.at < 86400000 &&
        typeof value.body === "string"
      )
        return value as {
          body: string;
          links: string[];
          mention: string;
          clientId: string;
        };
    } catch {}
    return null;
  });
  const data = useResource<{
      discussion: DiscussionData;
      messages: MessageData[];
      links: ArtifactCard[];
      canEdit: boolean;
      canManage: boolean;
    }>(collabApi(w, p) + "/discussions/" + id),
    members = useResource<{ members: Member[] }>(
      `/api/projects/${p}/members?workspaceId=${w}`,
    ),
    [body, setBody] = useState(restored?.body ?? ""),
    [links, setLinks] = useState<string[]>(restored?.links ?? []),
    [mention, setMention] = useState(restored?.mention ?? ""),
    [clientId, setClientId] = useState(
      () => restored?.clientId ?? crypto.randomUUID(),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  usePageTitle(data.data?.discussion.title ?? "Discussion");
  useEffect(() => {
    if (!data.data?.canEdit) return;
    try {
      if (body.trim())
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ body, links, mention, clientId, at: Date.now() }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [draftKey, body, links, mention, clientId, data.data?.canEdit]);
  if (data.error) return <Failure error={data.error} retry={data.reload} />;
  if (!data.data) return <Loading />;
  const d = data.data;
  return (
    <div className="discussions-workspace">
      <TopicRail w={w} p={p} active={id} />
      <div className="discussion-page">
        <ToolbarActions>
          <Link
            className="toolbar-button"
            href={collabPath(w, p) + "/discussions"}
          >
            All discussions
          </Link>
        </ToolbarActions>
        <div className="discussion-heading">
          <div>
            <small className="muted">Project discussion</small>
            <h1>{d.discussion.title}</h1>
          </div>
          <details className="discussion-related">
            <summary>Related research ({d.links.length})</summary>
            <ArtifactCards items={d.links} />
          </details>
        </div>
        <div className="discussion-messages">
          {d.messages.map((m) => (
            <MessageRow
              key={m.id}
              w={w}
              p={p}
              thread={id}
              message={m}
              name={
                members.data?.members.find((u) => u.userId === m.authorId)
                  ?.name ?? "Former member"
              }
              canEdit={d.canEdit && (d.canManage || m.authorId === userId)}
              links={d.links.filter((c) => m.artifactIds.includes(c.id))}
              reload={data.reload}
            />
          ))}
          {d.messages.length === 500 && (
            <p className="muted">
              This topic shows its first 500 messages. Continue in a new topic.
            </p>
          )}
        </div>
        {d.canEdit ? (
          <form
            className="discussion-composer"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                await api(collabApi(w, p) + `/discussions/${id}/messages`, {
                  clientId,
                  body,
                  links,
                  mentions: mention ? [mention] : [],
                });
                setBody("");
                setLinks([]);
                setMention("");
                setClientId(crypto.randomUUID());
                try {
                  sessionStorage.removeItem(draftKey);
                } catch {}
                data.reload();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Reply
              <textarea
                aria-label="Reply"
                disabled={busy}
                required
                maxLength={20000}
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Share an observation…"
              />
            </label>
            {!!body && (
              <span className="composer-draft" role="status">
                Draft kept on this tab{" "}
                <button
                  type="button"
                  onClick={() => {
                    setBody("");
                    setLinks([]);
                    setMention("");
                  }}
                >
                  Discard draft
                </button>
              </span>
            )}
            <details>
              <summary>Attach research or notify someone</summary>
              <LinkPicker w={w} p={p} value={links} onChange={setLinks} />
              <label>
                Notify member
                <select
                  value={mention}
                  disabled={busy}
                  onChange={(e) => setMention(e.target.value)}
                >
                  <option value="">No explicit mention</option>
                  {members.data?.members
                    .filter((m) => m.userId !== userId)
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            </details>
            <InlineError error={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Sending…" : "Send reply"}
            </button>
          </form>
        ) : (
          <p className="read-only-message">
            Read only · viewers can follow this discussion.
          </p>
        )}
      </div>
    </div>
  );
}
function TopicRail({ w, p, active }: { w: string; p: string; active: string }) {
  const data = useResource<{ items: DiscussionData[] }>(
      collabApi(w, p) + "/discussions",
    ),
    [query, setQuery] = useState("");
  return (
    <aside className="topic-rail" aria-label="Project topics">
      <Link className="topic-heading" href={collabPath(w, p) + "/discussions"}>
        Discussions
      </Link>
      <input
        aria-label="Search topics"
        placeholder="Find a topic…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <nav>
        {data.data?.items
          .filter((d) => d.title.toLowerCase().includes(query.toLowerCase()))
          .map((d) => (
            <Link
              key={d.id}
              href={collabPath(w, p) + "/discussions/" + d.id}
              aria-current={active === d.id ? "page" : undefined}
            >
              <Icon name="discussion" />
              <span>{d.title}</span>
            </Link>
          ))}
      </nav>
    </aside>
  );
}
function MessageRow({
  w,
  p,
  thread,
  message: m,
  name,
  canEdit,
  links,
  reload,
}: {
  w: string;
  p: string;
  thread: string;
  message: MessageData;
  name: string;
  canEdit: boolean;
  links: ArtifactCard[];
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(m.body),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <article className="discussion-message">
      <div className="message-author">
        <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
        <strong>{name}</strong>
        <time>{new Date(m.createdAt).toLocaleString()}</time>
        {m.editedAt && <small>edited</small>}
        {canEdit && (
          <button
            onClick={() => {
              setBody(m.body);
              setEditing(true);
            }}
          >
            Edit message
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                collabApi(w, p) + `/discussions/${thread}/messages/${m.id}`,
                { body, revision: m.revision },
                "PATCH",
              );
              setEditing(false);
              reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Edit message
            <textarea
              required
              value={body}
              maxLength={20000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button disabled={busy}>Save message</button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <InlineError error={error} />
        </form>
      ) : (
        <p className="message-body">{m.body}</p>
      )}
      <ArtifactCards items={links} />
    </article>
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
