"use client";
import { DiscussionCreateDialog } from "./discussion-form";
import { PopoverMenu } from "./ui";
import { TaskCreateDialog, TaskFields } from "./task-form";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSafeNavigation } from "./navigation-safety";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ArtifactCard, Member } from "@/lib/collaboration-types";
import { Icon, InlineError, Modal, useResource } from "./ui";
export const collabApi = (w: string, p: string) =>
  `/api/collaboration/${w}/${p}`;
export const collabPath = (w: string, p: string) => `/w/${w}/p/${p}`;
export function ArtifactCards({ items }: { items: ArtifactCard[] }) {
  return (
    <div className="artifact-cards">
      {items.map((c) => (
        <Link key={c.id} href={c.href} className="artifact-card">
          <Icon
            name={
              c.kind === "task"
                ? "check"
                : c.kind === "discussion"
                  ? "people"
                  : c.kind === "source"
                    ? "book"
                    : "note"
            }
          />
          <span>
            <small>
              {c.kind}
              {c.archived ? " · archived/removed" : ""}
            </small>
            <strong>{c.title}</strong>
          </span>
          <Icon name="arrow" />
        </Link>
      ))}
    </div>
  );
}
export function LinkPicker({
  w,
  p,
  value,
  onChange,
}: {
  w: string;
  p: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const data = useResource<ArtifactCard[]>(collabApi(w, p) + "/artifacts");
  return (
    <label>
      Related research
      <select
        aria-label="Add research link"
        value=""
        onChange={(e) => {
          if (e.target.value)
            onChange([...new Set([...value, e.target.value])]);
        }}
      >
        <option value="">Attach a document, source, note or task…</option>
        {data.data
          ?.filter((c) => !value.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.kind} · {c.title}
            </option>
          ))}
      </select>
      <div className="selected-links">
        {value.map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => onChange(value.filter((i) => i !== id))}
          >
            {data.data?.find((c) => c.id === id)?.title ?? "Linked research"} ×
          </button>
        ))}
      </div>
    </label>
  );
}
export { TaskFields } from "./task-form";
export function CreateArtifactDialog(
  props: Parameters<typeof ArtifactDialog>[0],
) {
  if (props.kind === "discussion") return <DiscussionCreateDialog {...props} />;
  return props.kind === "task" ? (
    <TaskCreateDialog {...props} />
  ) : (
    <ArtifactDialog {...props} />
  );
}
function ArtifactDialog({
  w,
  p,
  kind,
  originId,
  origin,
  initialText = "",
  returnQuery,
  onClose,
}: {
  w: string;
  p: string;
  kind: "document" | "task" | "discussion";
  originId?: string;
  origin?: { sourceId: string; versionId?: string; annotationId?: string };
  initialText?: string;
  returnQuery?: string;
  onClose: () => void;
}) {
  const router = useRouter(),
    navigate = useSafeNavigation(),
    documents = useResource<{ items: { id: string; title: string }[] }>(
      kind === "document" && origin ? collabApi(w, p) + "/documents" : null,
    ),
    members = useResource<{ members: Member[] }>(
      kind !== "document"
        ? `/api/projects/${p}/members?workspaceId=${w}`
        : null,
    );
  const [requestId] = useState(() => crypto.randomUUID()),
    [destination, setDestination] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(initialText),
    [links, setLinks] = useState(originId ? [originId] : []),
    [task, setTask] = useState({
      title: "",
      description: initialText,
      status: "backlog",
      priority: "medium",
      assigneeId: null as string | null,
      dueDate: null as string | null,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const part =
        kind === "document"
          ? "documents"
          : kind === "task"
            ? "tasks"
            : "discussions";
      const input =
        kind === "document"
          ? { requestId, title, ...(origin ? { origin } : {}) }
          : kind === "task"
            ? { requestId, ...task, links }
            : { requestId, title, body, links, mentions: [] };
      const r = await api<{ id: string }>(collabApi(w, p) + "/" + part, input);
      onClose();
      const target =
        collabPath(w, p) +
        "/" +
        (kind === "document" ? "docs" : part) +
        "/" +
        r.id +
        (kind === "document" && returnQuery
          ? "?documents=" + encodeURIComponent(returnQuery)
          : "");
      await navigate(target, () => router.push(target));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`New ${kind}`} onClose={onClose}>
      <form onSubmit={submit} className="collab-form">
        {kind === "document" && origin && !!documents.data?.items.length && (
          <div className="writing-destination">
            <label>
              Add to an existing document
              <select
                aria-label="Writing destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Choose a document…</option>
                {documents.data.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {destination && (
              <Link
                className="button"
                href={
                  collabPath(w, p) +
                  "/docs/" +
                  destination +
                  "?" +
                  new URLSearchParams({
                    citeSource: origin.sourceId,
                    ...(origin.versionId
                      ? { citeVersion: origin.versionId }
                      : {}),
                    ...(origin.annotationId
                      ? { citeAnnotation: origin.annotationId }
                      : {}),
                  })
                }
                onClick={onClose}
              >
                Open and cite
              </Link>
            )}
            <small className="muted">Or create a new document below.</small>
          </div>
        )}
        {kind === "task" ? (
          <TaskFields
            value={task}
            onChange={setTask}
            members={members.data?.members ?? []}
          />
        ) : (
          <>
            <label>
              {kind === "document" ? "Document title" : "Topic title"}
              <input
                autoFocus
                required
                maxLength={300}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {kind === "discussion" && (
              <label>
                First message
                <textarea
                  required
                  rows={5}
                  maxLength={20000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
            )}
          </>
        )}
        {kind !== "document" && (
          <LinkPicker w={w} p={p} value={links} onChange={setLinks} />
        )}
        <InlineError error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : `Create ${kind}`}
        </button>
      </form>
    </Modal>
  );
}
export function ResearchActions({
  w,
  p,
  id,
  origin,
  canEdit,
  compact = false,
}: {
  w: string;
  p: string;
  id: string;
  compact?: boolean;
  origin?: { sourceId: string; versionId?: string; annotationId?: string };
  canEdit: boolean;
}) {
  const [kind, setKind] = useState<"document" | "task" | "discussion" | null>(
    null,
  );
  const [showLinks, setShowLinks] = useState(!compact);
  const links = useResource<ArtifactCard[]>(
    showLinks ? collabApi(w, p) + `/artifacts/${id}/links` : null,
  );
  return (
    <div className="research-connected">
      {compact ? (
        <>
          {origin && canEdit && (
            <button
              className="toolbar-button"
              onClick={() => setKind("document")}
            >
              <Icon name="note" /> Write from this
            </button>
          )}
          <PopoverMenu className="action-menu">
            <summary className="toolbar-button">
              <Icon name="options" /> More
            </summary>
            <div>
              {origin && (
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("atlas-ai-open", {
                        detail: {
                          w,
                          p,
                          sourceId: origin.sourceId,
                          versionId: origin.versionId,
                        },
                      }),
                    )
                  }
                >
                  <Icon name="sparkles" /> Ask about this source
                </button>
              )}
              {canEdit && (
                <>
                  <button onClick={() => setKind("task")}>Create task</button>
                  <button onClick={() => setKind("discussion")}>Discuss</button>
                </>
              )}
              <button onClick={() => setShowLinks((v) => !v)}>
                Related research
              </button>
            </div>
          </PopoverMenu>
        </>
      ) : (
        <>
          {origin && (
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("atlas-ai-open", {
                    detail: {
                      w,
                      p,
                      sourceId: origin.sourceId,
                      versionId: origin.versionId,
                    },
                  }),
                )
              }
            >
              <Icon name="sparkles" /> Ask about this source
            </button>
          )}
          {canEdit && (
            <div className="actions">
              {origin && (
                <button onClick={() => setKind("document")}>
                  <Icon name="note" /> Write from this
                </button>
              )}
              <button onClick={() => setKind("task")}>Create task</button>
              <button onClick={() => setKind("discussion")}>Discuss</button>
            </div>
          )}
        </>
      )}
      {links.data && links.data.length > 0 && (
        <>
          <small className="muted">Connected research</small>
          <ArtifactCards items={links.data} />
        </>
      )}
      {kind && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind={kind}
          originId={id}
          origin={origin}
          onClose={() => setKind(null)}
        />
      )}
    </div>
  );
}
