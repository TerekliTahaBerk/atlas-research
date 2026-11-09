"use client";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type {
  DiscussionData,
  MessageData,
  ArtifactCard,
  Member,
} from "@/lib/collaboration-types";
import { ArtifactCards } from "./collaboration-shared";
import { DiscussionCreateDialog } from "./discussion-form";
import { TaskLinkPicker } from "./task-form";
import {
  Failure,
  Loading,
  InlineError,
  Icon,
  Modal,
  PopoverMenu,
  useResource,
} from "./ui";
import { usePageTitle } from "./working-tabs";
type Detail = {
  discussion: DiscussionData;
  messages: MessageData[];
  links: ArtifactCard[];
  total: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  canEdit: boolean;
  canManage: boolean;
  canRename: boolean;
};
type Topics = {
  items: DiscussionData[];
  total: number;
  pageSize: number;
  canEdit: boolean;
};
function mergeMessages(a: MessageData[], b: MessageData[]) {
  const map = new Map(a.map((m) => [m.id, m]));
  b.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(
    (a, b) =>
      (a.orderStamp ?? a.createdAt).localeCompare(
        b.orderStamp ?? b.createdAt,
      ) || a.id.localeCompare(b.id),
  );
}
export function DiscussionsExperience({
  w,
  p,
  userId,
  id,
}: {
  w: string;
  p: string;
  userId: string;
  id?: string;
}) {
  const key = `atlas-discussions:${userId}/${w}/${p}`;
  const [filter, setFilter] = useState<{
      q: string;
      page: number;
      archived: boolean;
    }>(() => {
      try {
        const query = new URLSearchParams(location.search);
        if (query.has("q"))
          return {
            q: query.get("q") ?? "",
            page: Math.max(0, Number(query.get("page")) || 0),
            archived: query.get("archived") === "true",
          };
        return JSON.parse(
          sessionStorage.getItem(key) ?? '{"q":"","page":0,"archived":false}',
        );
      } catch {
        return { q: "", page: 0, archived: false };
      }
    }),
    [term, setTerm] = useState(filter.q),
    [creating, setCreating] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(filter.q), 250);
    return () => clearTimeout(timer);
  }, [filter.q]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(filter));
    } catch {}
  }, [key, filter]);
  const query = new URLSearchParams({
      q: term,
      page: String(filter.page),
      archived: String(filter.archived),
    }).toString(),
    base = `/w/${w}/p/${p}/discussions`,
    endpoint = `/api/collaboration/${w}/${p}/discussions`,
    topics = useResource<Topics>(endpoint + "?" + query, true, true);
  return (
    <div className={"discussion-experience" + (id ? " has-topic" : "")}>
      <aside className="discussion-topic-list" aria-label="Project topics">
        <header>
          <h1>Discussions</h1>
          {topics.data?.canEdit && (
            <button
              className="icon-button"
              aria-label="New discussion"
              onClick={() => setCreating(true)}
            >
              <Icon name="plus" />
            </button>
          )}
        </header>
        <label className="discussion-search">
          <span className="sr-only">Search topics</span>
          <input
            aria-label="Search topics"
            type="search"
            maxLength={200}
            placeholder="Find a topic…"
            value={filter.q}
            onChange={(e) =>
              setFilter({ ...filter, q: e.target.value, page: 0 })
            }
          />
        </label>
        <label className="discussion-view">
          <span className="sr-only">Topic view</span>
          <select
            aria-label="Topic view"
            value={filter.archived ? "archived" : "active"}
            onChange={(e) =>
              setFilter({
                ...filter,
                archived: e.target.value === "archived",
                page: 0,
              })
            }
          >
            <option value="active">Active topics</option>
            <option value="archived">Archived topics</option>
          </select>
          <small>{topics.data?.total ?? 0}</small>
        </label>
        {!!topics.error && <InlineError error={topics.error} />}
        <nav aria-label="Topics">
          {topics.data?.items.map((d) => (
            <Link
              key={d.id}
              href={base + "/" + d.id + "?" + query}
              aria-current={d.id === id ? "page" : undefined}
            >
              <Icon name="discussion" />
              <span>
                <strong>{d.title}</strong>
                <small>
                  Updated {new Date(d.updatedAt).toLocaleDateString()}
                </small>
              </span>
            </Link>
          ))}
        </nav>
        {topics.data && !topics.data.items.length && (
          <div className="discussion-topics-empty">
            <p>
              {filter.q
                ? "No matching topics"
                : filter.archived
                  ? "No archived topics"
                  : "No topics yet"}
            </p>
            {filter.q && (
              <button onClick={() => setFilter({ ...filter, q: "", page: 0 })}>
                Clear search
              </button>
            )}
            {!filter.archived && topics.data.canEdit && (
              <button onClick={() => setCreating(true)}>New discussion</button>
            )}
          </div>
        )}
        {!topics.data && !topics.error && <Loading />}
        {topics.data && topics.data.total > 30 && (
          <nav className="discussion-topic-pages" aria-label="Topic pages">
            <button
              disabled={!filter.page}
              onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
            >
              Previous
            </button>
            <span>
              {filter.page + 1}/{Math.ceil(topics.data.total / 30)}
            </span>
            <button
              disabled={(filter.page + 1) * 30 >= topics.data.total}
              onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
            >
              Next
            </button>
          </nav>
        )}
      </aside>
      {id ? (
        <Thread
          key={userId + id}
          w={w}
          p={p}
          id={id}
          userId={userId}
          back={base + "?" + query}
          topicChanged={topics.reload}
        />
      ) : (
        <section className="discussion-welcome">
          <Icon name="discussion" />
          <h2>Research together</h2>
          <p>
            Choose a topic or start a discussion from a source, PDF note,
            document or task.
          </p>
          {topics.data?.canEdit && (
            <button className="primary" onClick={() => setCreating(true)}>
              New discussion
            </button>
          )}
        </section>
      )}
      {creating && (
        <DiscussionCreateDialog
          w={w}
          p={p}
          onClose={() => {
            setCreating(false);
            topics.reload();
          }}
        />
      )}
    </div>
  );
}
function Thread({
  w,
  p,
  id,
  userId,
  back,
  topicChanged,
}: {
  w: string;
  p: string;
  id: string;
  userId: string;
  back: string;
  topicChanged: () => void;
}) {
  const endpoint = `/api/collaboration/${w}/${p}/discussions/${id}`;
  const [data, setData] = useState<Detail>(),
    [error, setError] = useState<unknown>(),
    [more, setMore] = useState(false),
    [pendingNew, setPendingNew] = useState(0),
    [renaming, setRenaming] = useState(false);
  const value = useRef<Detail | undefined>(undefined),
    alive = useRef(true),
    requesting = useRef(false),
    scroller = useRef<HTMLDivElement>(null),
    initial = useRef(true),
    prepend = useRef<{ height: number; top: number } | null>(null);
  const members = useResource<{ members: Member[] }>(
    `/api/projects/${p}/members?workspaceId=${w}`,
  );
  const refresh = useCallback(async () => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      const previous = value.current;
      let next = await api<Detail>(
        endpoint +
          "?window=50" +
          (previous?.messages.length
            ? "&after=" + previous.messages.at(-1)!.id
            : ""),
      );
      let messages = previous
        ? mergeMessages(previous.messages, next.messages)
        : next.messages;
      const added = next.messages.filter(
        (m) => !previous?.messages.some((old) => old.id === m.id),
      ).length;
      if (previous) {
        const recent = await api<Detail>(endpoint + "?window=50");
        messages = mergeMessages(
          messages,
          recent.messages.filter((m) =>
            messages.some((old) => old.id === m.id),
          ),
        );
      }
      next = {
        ...next,
        messages,
        hasMoreBefore: previous?.hasMoreBefore ?? next.hasMoreBefore,
      };
      if (alive.current) {
        value.current = next;
        setData(next);
        setError(undefined);
        if (previous && added) setPendingNew((n) => n + added);
      }
    } catch (e) {
      if (alive.current) {
        setError(e);
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          value.current = undefined;
          setData(undefined);
          window.dispatchEvent(new Event("atlas-access-changed"));
        }
      }
    } finally {
      requesting.current = false;
    }
  }, [endpoint]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const focus = () => void refresh(),
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 10000);
    window.addEventListener("focus", focus);
    window.addEventListener("atlas-access-changed", focus);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("atlas-access-changed", focus);
    };
  }, [refresh]);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !data) return;
    if (initial.current) {
      node.scrollTop = node.scrollHeight;
      initial.current = false;
    } else if (prepend.current) {
      node.scrollTop =
        prepend.current.top + node.scrollHeight - prepend.current.height;
      prepend.current = null;
    }
  }, [data]);
  const older = async () => {
    if (requesting.current || !data) return;
    requesting.current = true;
    setMore(true);
    try {
      const old = await api<Detail>(
        endpoint + "?window=50&before=" + data.messages[0].id,
      );
      if (alive.current) {
        const node = scroller.current!;
        prepend.current = { top: node.scrollTop, height: node.scrollHeight };
        const next = {
          ...value.current!,
          messages: mergeMessages(old.messages, value.current!.messages),
          hasMoreBefore: old.hasMoreBefore,
        };
        value.current = next;
        setData(next);
        setError(undefined);
      }
    } catch (e) {
      setError(e);
    } finally {
      setMore(false);
      requesting.current = false;
    }
  };
  usePageTitle(data?.discussion.title ?? "Discussion");
  if (!data)
    return error ? (
      <Failure error={error} retry={() => void refresh()} />
    ) : (
      <Loading />
    );
  const bottom = () => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "auto",
    });
    setPendingNew(0);
  };
  return (
    <section className="discussion-conversation" aria-label="Selected topic">
      <header className="discussion-conversation-heading">
        <Link className="discussion-back" href={back}>
          <Icon name="arrow" /> Topics
        </Link>
        <div>
          <small>
            Project discussion{data.discussion.archivedAt ? " · Archived" : ""}
          </small>
          <h2>{data.discussion.title}</h2>
        </div>
        <PopoverMenu className="action-menu discussion-topic-menu">
          <summary className="icon-button" aria-label="Topic actions">
            <Icon name="options" />
          </summary>
          <div>
            <button onClick={() => void refresh()}>Refresh messages</button>
            {data.canRename && (
              <button onClick={() => setRenaming(true)}>Rename topic</button>
            )}
            {data.canManage && (
              <button
                onClick={async () => {
                  try {
                    await api(
                      endpoint,
                      {
                        revision: data.discussion.revision ?? 1,
                        archived: !data.discussion.archivedAt,
                      },
                      "PATCH",
                    );
                    await refresh();
                    topicChanged();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {data.discussion.archivedAt ? "Restore topic" : "Archive topic"}
              </button>
            )}
          </div>
        </PopoverMenu>
      </header>
      {!!error && <InlineError error={error} />}
      <details className="discussion-research">
        <summary>
          Related research · {data.links.length}
          {data.links.length === 100 ? " (up to 100 shown)" : ""}
        </summary>
        <ArtifactCards items={data.links} />
      </details>
      {(pendingNew > 0 || data.hasMoreAfter) && (
        <button
          className="discussion-new-messages"
          onClick={async () => {
            if (data.hasMoreAfter) await refresh();
            bottom();
          }}
        >
          {data.hasMoreAfter
            ? "Load more new messages"
            : `${pendingNew} new message${pendingNew === 1 ? "" : "s"} · Jump to latest`}
        </button>
      )}
      <div
        ref={scroller}
        className="discussion-message-scroll"
        aria-label="Messages"
        tabIndex={0}
      >
        {data.hasMoreBefore && (
          <button
            className="discussion-load-older"
            disabled={more}
            onClick={() => void older()}
          >
            {more ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {!data.messages.length && <p className="empty">No messages yet.</p>}
        {data.messages.map((m) => (
          <Message
            key={m.id}
            w={w}
            p={p}
            thread={id}
            message={m}
            name={
              members.data?.members.find((u) => u.userId === m.authorId)
                ?.name ?? "Former member"
            }
            canEdit={data.canEdit && (data.canManage || m.authorId === userId)}
            moderated={m.authorId !== userId}
            members={members.data?.members ?? []}
            links={
              m.links ?? data.links.filter((c) => m.artifactIds.includes(c.id))
            }
            refresh={refresh}
          />
        ))}
        <div className="discussion-message-end" />
      </div>
      {data.canEdit ? (
        <Reply
          key={id}
          w={w}
          p={p}
          id={id}
          userId={userId}
          members={members.data?.members ?? []}
          sent={async () => {
            await refresh();
            topicChanged();
            requestAnimationFrame(bottom);
          }}
        />
      ) : (
        <p className="discussion-readonly">
          {data.discussion.archivedAt
            ? "Archived topic · restore it to continue the conversation."
            : "Read only · viewers can follow this discussion."}
        </p>
      )}
      {renaming && (
        <Rename
          discussion={data.discussion}
          endpoint={endpoint}
          close={() => setRenaming(false)}
          changed={async () => {
            await refresh();
            topicChanged();
          }}
        />
      )}
    </section>
  );
}
function Rename({
  discussion,
  endpoint,
  close,
  changed,
}: {
  discussion: DiscussionData;
  endpoint: string;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [title, setTitle] = useState(discussion.title),
    [revision, setRevision] = useState(discussion.revision ?? 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Modal title="Rename topic" onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(undefined);
          try {
            await api(endpoint, { title, revision }, "PATCH");
            await changed();
            close();
          } catch (e) {
            setError(e);
            await changed();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Topic title
          <input
            aria-label="Topic title"
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <InlineError error={error} />
        {error instanceof ApiError && error.status === 409 && (
          <button
            type="button"
            onClick={() => {
              setTitle(discussion.title);
              setRevision(discussion.revision ?? 1);
              setError(undefined);
            }}
          >
            Load latest title
          </button>
        )}
        <button disabled={busy}>Save title</button>
      </form>
    </Modal>
  );
}
function Reply({
  w,
  p,
  id,
  userId,
  members,
  sent,
}: {
  w: string;
  p: string;
  id: string;
  userId: string;
  members: Member[];
  sent: () => Promise<void>;
}) {
  const key = `atlas-reply:${userId}:${w}:${p}:${id}`;
  const [restored] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return v && Date.now() - v.at < 86400000 ? v : null;
    } catch {
      return null;
    }
  });
  const [body, setBody] = useState<string>(restored?.body ?? ""),
    [links, setLinks] = useState<string[]>(restored?.links ?? []),
    [mentions, setMentions] = useState<string[]>(
      restored?.mentions ?? (restored?.mention ? [restored.mention] : []),
    ),
    [clientId, setClientId] = useState<string>(
      () => restored?.clientId ?? crypto.randomUUID(),
    ),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>();
  const sending = useRef(false),
    pending = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    try {
      if (body.trim() || links.length)
        sessionStorage.setItem(
          key,
          JSON.stringify({ body, links, mentions, clientId, at: Date.now() }),
        );
      else sessionStorage.removeItem(key);
    } catch {}
  }, [body, links, mentions, clientId, key]);
  const submit = async () => {
    if (sending.current || !body.trim()) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    const payload = pending.current ?? { clientId, body, links, mentions };
    pending.current = payload;
    try {
      await api(
        `/api/collaboration/${w}/${p}/discussions/${id}/messages`,
        payload,
      );
      pending.current = null;
      setBody("");
      setLinks([]);
      setMentions([]);
      setClientId(crypto.randomUUID());
      setUncertain(false);
      await sent();
    } catch (e) {
      setError(e);
      const retry = !(
        e instanceof ApiError && [400, 403, 404, 409].includes(e.status)
      );
      setUncertain(retry);
      if (!retry) pending.current = null;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className="discussion-reply"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={busy || uncertain}>
        <label>
          <span className="sr-only">Reply</span>
          <textarea
            onFocus={() =>
              window.dispatchEvent(new Event("atlas-research-writing"))
            }
            aria-label="Reply"
            required
            maxLength={20000}
            rows={3}
            placeholder="Share an observation…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </label>
        <details>
          <summary>Attach research or mention a teammate</summary>
          <TaskLinkPicker w={w} p={p} value={links} onChange={setLinks} />
          <label>
            Mention members
            <select
              multiple
              aria-label="Mention members"
              value={mentions}
              onChange={(e) =>
                setMentions([...e.target.selectedOptions].map((o) => o.value))
              }
            >
              {members
                .filter((m) => m.active && m.userId !== userId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.role}
                  </option>
                ))}
            </select>
          </label>
        </details>
      </fieldset>
      <InlineError error={error} />
      {uncertain && (
        <p role="status">
          Reply confirmation was interrupted. Your text, research and original
          submission are kept for retry.
        </p>
      )}
      <footer>
        <small>
          {body ? "Draft kept on this tab · " : ""}Cmd/Ctrl+Enter to send
        </small>
        {!!body && !busy && !uncertain && (
          <button
            type="button"
            onClick={() => {
              setBody("");
              setLinks([]);
              setMentions([]);
              pending.current = null;
              setClientId(crypto.randomUUID());
            }}
          >
            Discard draft
          </button>
        )}
        <button className="primary" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : error ? "Retry reply" : "Send reply"}
        </button>
      </footer>
    </form>
  );
}
function Message({
  w,
  p,
  thread,
  message,
  name,
  canEdit,
  moderated,
  members,
  links,
  refresh,
}: {
  w: string;
  p: string;
  thread: string;
  message: MessageData;
  name: string;
  canEdit: boolean;
  moderated: boolean;
  members: Member[];
  links: ArtifactCard[];
  refresh: () => Promise<void>;
}) {
  const [ack, setAck] = useState<MessageData>();
  const m = ack && ack.revision > message.revision ? ack : message;
  const [latest, setLatest] = useState<MessageData>();
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(m.body),
    [revision, setRevision] = useState(m.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <article className="discussion-message" data-message={m.id}>
      <header className="message-author">
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <strong>{name}</strong>
        <time
          dateTime={m.createdAt}
          title={new Date(m.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        >
          {new Date(m.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        {m.editedAt && (
          <small title={new Date(m.editedAt).toLocaleString()}>Edited</small>
        )}
        {canEdit && !editing && (
          <button
            onClick={() => {
              setBody(m.body);
              setRevision(m.revision);
              setError(undefined);
              setEditing(true);
            }}
          >
            {moderated ? "Moderate message" : "Edit message"}
          </button>
        )}
      </header>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              const saved = await api<MessageData>(
                `/api/collaboration/${w}/${p}/discussions/${thread}/messages/${m.id}`,
                { body, revision },
                "PATCH",
              );
              setAck(saved);
              setEditing(false);
              await refresh();
            } catch (e) {
              setError(e);
              if (e instanceof ApiError && e.status === 409) {
                const server = await api<MessageData>(
                  `/api/collaboration/${w}/${p}/discussions/${thread}/messages/${m.id}`,
                ).catch(() => undefined);
                if (server) {
                  setLatest(server);
                  setAck(server);
                }
              }
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Edit message
            <textarea
              aria-label="Edit message"
              required
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <InlineError error={error} />
          {error instanceof ApiError && error.status === 409 && (
            <section>
              <p>A newer edit is kept on the server. Your text is retained.</p>
              <blockquote>{latest?.body ?? m.body}</blockquote>
              <button
                type="button"
                onClick={() => {
                  setRevision(latest?.revision ?? m.revision);
                  setError(undefined);
                }}
              >
                Review my text against revision {latest?.revision ?? m.revision}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBody(latest?.body ?? m.body);
                  setRevision(latest?.revision ?? m.revision);
                  setError(undefined);
                }}
              >
                Use latest message
              </button>
            </section>
          )}
          <button disabled={busy}>Save message</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <p className="message-body">{m.body}</p>
      )}
      {!!m.mentions?.length && (
        <small className="discussion-mentioned">
          Mentioned:{" "}
          {m.mentions
            .map(
              (id) =>
                members.find((v) => v.active && v.userId === id)?.name ??
                "Former member",
            )
            .join(", ")}
        </small>
      )}
      <ArtifactCards items={links} />
    </article>
  );
}
