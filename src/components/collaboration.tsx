"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  ArtifactCard,
  DiscussionData,
  TaskData,
  MessageData,
  Member,
} from "@/lib/collaboration-types";
import { taskStatuses, statusName } from "@/lib/collaboration-types";
import { WorkspaceShell } from "./workspace-shell";
import { usePageTitle } from "./working-tabs";
import {
  Failure,
  InlineError,
  Loading,
  ToolbarActions,
  Icon,
  Modal,
  useResource,
} from "./ui";
import {
  ArtifactCards,
  CreateArtifactDialog,
  LinkPicker,
  TaskFields,
  ResearchActions,
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
          id ? (
            <TaskDetail key={id} w={w} p={p} id={id} />
          ) : (
            <Tasks w={w} p={p} />
          )
        ) : id ? (
          <Discussion key={id} w={w} p={p} id={id} userId={me.user.id} />
        ) : (
          <Discussions w={w} p={p} />
        )
      }
    </WorkspaceShell>
  );
}
function Tasks({ w, p }: { w: string; p: string }) {
  const [view, setView] = useState<"board" | "list">("board"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [assignee, setAssignee] = useState(""),
    [priority, setPriority] = useState(""),
    [archived, setArchived] = useState(false),
    [creating, setCreating] = useState(false);
  const data = useResource<{ items: TaskData[]; canEdit: boolean }>(
      collabApi(w, p) + "/tasks" + (archived ? "?archived=true" : ""),
    ),
    members = useResource<{ members: Member[] }>(
      `/api/projects/${p}/members?workspaceId=${w}`,
    );
  const items =
    data.data?.items.filter(
      (t) =>
        (!query || t.title.toLowerCase().includes(query.toLowerCase())) &&
        (!status || t.status === status) &&
        (!assignee ||
          (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee)) &&
        (!priority || t.priority === priority),
    ) ?? [];
  return (
    <div className="tasks-page">
      <ToolbarActions>
        {data.data?.canEdit && (
          <button className="toolbar-button" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New task
          </button>
        )}
      </ToolbarActions>
      <div className="collab-list-heading">
        <h1 className="sr-only">Tasks</h1>
        <div className="segmented">
          <button
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            Board
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
      </div>
      <div className="collab-filters">
        <input
          className="compact-search"
          aria-label="Search tasks"
          placeholder="Find a task…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {taskStatuses.map((s) => (
            <option key={s} value={s}>
              {statusName(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {members.data?.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          {["low", "medium", "high", "urgent"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="compact-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archived
        </label>
      </div>
      {data.error ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : view === "board" ? (
        <div className="task-board">
          {taskStatuses.map((s) => (
            <section className="task-column" key={s}>
              <h2>
                <span className={"status-dot " + s} />
                {statusName(s)}{" "}
                <small>{items.filter((t) => t.status === s).length}</small>
              </h2>
              {items
                .filter((t) => t.status === s)
                .map((t) => (
                  <TaskCard
                    key={t.id}
                    w={w}
                    p={p}
                    task={t}
                    members={members.data?.members ?? []}
                    canEdit={data.data!.canEdit && !t.archivedAt}
                    reload={data.reload}
                  />
                ))}
              {items.filter((t) => t.status === s).length === 0 && (
                <p className="muted column-empty">No tasks</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="collab-rows">
          {!items.length && (
            <p className="empty">No tasks match these filters.</p>
          )}
          {items.map((t) => (
            <div key={t.id} className="collab-row">
              <Icon name="check" />
              <Link
                className="task-row-link"
                href={collabPath(w, p) + "/tasks/" + t.id}
              >
                <strong>{t.title}</strong>
                <small>
                  {statusName(t.status)} · {t.priority} ·{" "}
                  {members.data?.members.find((m) => m.userId === t.assigneeId)
                    ?.name ?? "Unassigned"}
                  {t.dueDate ? " · Due " + t.dueDate : ""}
                </small>
              </Link>
              {data.data!.canEdit && !t.archivedAt && (
                <TaskQuickEdit
                  w={w}
                  p={p}
                  task={t}
                  members={members.data?.members ?? []}
                  reload={data.reload}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {creating && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind="task"
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
function taskPayload(t: TaskData) {
  return {
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    dueDate: t.dueDate,
    revision: t.revision,
  };
}
function TaskCard({
  w,
  p,
  task: t,
  members,
  canEdit,
  reload,
}: {
  w: string;
  p: string;
  task: TaskData;
  members: Member[];
  canEdit: boolean;
  reload: () => void;
}) {
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <article className="task-card">
      <Link href={collabPath(w, p) + "/tasks/" + t.id}>{t.title}</Link>
      <div className="task-card-meta">
        <span className={"priority " + t.priority}>{t.priority}</span>
        <span>
          {members.find((m) => m.userId === t.assigneeId)?.name ?? "Unassigned"}
        </span>
        {t.dueDate && <time>{t.dueDate}</time>}
      </div>
      {canEdit && (
        <TaskQuickEdit w={w} p={p} task={t} members={members} reload={reload} />
      )}
      <select
        aria-label={`Status for ${t.title}`}
        disabled={!canEdit || busy}
        value={t.status}
        onChange={async (e) => {
          setBusy(true);
          try {
            await api(
              collabApi(w, p) + "/tasks/" + t.id,
              { ...taskPayload(t), status: e.target.value },
              "PATCH",
            );
            reload();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {taskStatuses.map((s) => (
          <option key={s} value={s}>
            {statusName(s)}
          </option>
        ))}
      </select>
      <InlineError error={error} />
    </article>
  );
}
function TaskQuickEdit({
  w,
  p,
  task,
  members,
  reload,
}: {
  w: string;
  p: string;
  task: TaskData;
  members: Member[];
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="task-quick-edit toolbar-button"
        aria-label={`Quick edit ${task.title}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="new" /> Edit
      </button>
      {open && (
        <TaskQuickForm
          w={w}
          p={p}
          task={task}
          members={members}
          close={() => setOpen(false)}
          reload={reload}
        />
      )}
    </>
  );
}
function TaskQuickForm({
  w,
  p,
  task,
  members,
  close,
  reload,
}: {
  w: string;
  p: string;
  task: TaskData;
  members: Member[];
  close: () => void;
  reload: () => void;
}) {
  const [value, setValue] = useState(taskPayload(task)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Modal title="Edit task" onClose={close}>
      <form
        className="collab-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await api(collabApi(w, p) + "/tasks/" + task.id, value, "PATCH");
            reload();
            close();
          } catch (error) {
            setError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TaskFields
          value={value}
          onChange={(v) => setValue({ ...v, revision: value.revision })}
          members={members}
          disabled={busy}
        />
        <InlineError error={error} />
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save task"}
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TaskDetail({ w, p, id }: { w: string; p: string; id: string }) {
  const data = useResource<{
      task: TaskData;
      links: ArtifactCard[];
      canEdit: boolean;
      canManage: boolean;
    }>(collabApi(w, p) + "/tasks/" + id),
    members = useResource<{ members: Member[] }>(
      `/api/projects/${p}/members?workspaceId=${w}`,
    );
  if (data.error) return <Failure error={data.error} retry={data.reload} />;
  if (!data.data) return <Loading />;
  return (
    <TaskEditing
      w={w}
      p={p}
      detail={data.data}
      members={members.data?.members ?? []}
      reload={data.reload}
    />
  );
}
function TaskEditing({
  w,
  p,
  detail,
  members,
  reload,
}: {
  w: string;
  p: string;
  detail: {
    task: TaskData;
    links: ArtifactCard[];
    canEdit: boolean;
    canManage: boolean;
  };
  members: Member[];
  reload: () => void;
}) {
  usePageTitle(detail.task.title);
  const [value, setValue] = useState(taskPayload(detail.task)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  async function archive() {
    try {
      await api(
        collabApi(w, p) + "/tasks/" + detail.task.id,
        {
          action: "archive",
          revision: value.revision,
          archived: !detail.task.archivedAt,
        },
        "PATCH",
      );
      location.reload();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="collab-detail-page">
      <ToolbarActions>
        <Link href={collabPath(w, p) + "/tasks"} className="toolbar-button">
          All tasks
        </Link>
      </ToolbarActions>
      <div className="document-meta">
        <Icon name="check" />
        Task · revision {detail.task.revision}
        {detail.task.archivedAt ? " · Archived" : ""}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setSaved(false);
          setError(undefined);
          try {
            const next = await api<TaskData>(
              collabApi(w, p) + "/tasks/" + detail.task.id,
              value,
              "PATCH",
            );
            setValue(taskPayload(next));
            setSaved(true);
            reload();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TaskFields
          value={value}
          onChange={(v) => {
            setSaved(false);
            setValue({ ...v, revision: value.revision });
          }}
          members={members}
          disabled={!detail.canEdit || busy}
        />
        <InlineError error={error} />
        {detail.canEdit && (
          <button className="primary" disabled={busy}>
            Save task
          </button>
        )}
        {saved && (
          <span role="status" className="muted">
            {" "}
            Saved
          </span>
        )}
      </form>
      {detail.canManage && (
        <button onClick={archive}>
          {detail.task.archivedAt ? "Restore task" : "Archive task"}
        </button>
      )}
      <ResearchActions
        w={w}
        p={p}
        id={detail.task.id}
        canEdit={detail.canEdit}
      />
    </div>
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
