"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ArtifactCard, Member, TaskData } from "@/lib/collaboration-types";
import { taskStatuses, statusName } from "@/lib/collaboration-types";
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
export function TaskFields({
  value,
  onChange,
  members,
  disabled = false,
}: {
  value: Omit<TaskData, "id" | "revision" | "archivedAt" | "updatedAt">;
  onChange: (v: typeof value) => void;
  members: Member[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="task-fields">
      <label>
        Task title
        <input
          required
          maxLength={300}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          rows={5}
          maxLength={20000}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      <div className="field-grid">
        <label>
          Status
          <select
            aria-label="Status"
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
          >
            {taskStatuses.map((s) => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Priority"
            value={value.priority}
            onChange={(e) => onChange({ ...value, priority: e.target.value })}
          >
            {["low", "medium", "high", "urgent"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select
            aria-label="Assignee"
            value={value.assigneeId ?? ""}
            onChange={(e) =>
              onChange({ ...value, assigneeId: e.target.value || null })
            }
          >
            <option value="">Unassigned</option>
            {members
              .filter((m) => m.active && m.role !== "viewer")
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} · {m.role}
                </option>
              ))}
          </select>
        </label>
        <label>
          Due date
          <input
            type="date"
            value={value.dueDate ?? ""}
            onChange={(e) =>
              onChange({ ...value, dueDate: e.target.value || null })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
export function CreateArtifactDialog({
  w,
  p,
  kind,
  originId,
  origin,
  onClose,
}: {
  w: string;
  p: string;
  kind: "document" | "task" | "discussion";
  originId?: string;
  origin?: { sourceId: string; versionId?: string; annotationId?: string };
  onClose: () => void;
}) {
  const router = useRouter(),
    members = useResource<{ members: Member[] }>(
      kind !== "document"
        ? `/api/projects/${p}/members?workspaceId=${w}`
        : null,
    );
  const [requestId] = useState(() => crypto.randomUUID()),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [links, setLinks] = useState(originId ? [originId] : []),
    [task, setTask] = useState({
      title: "",
      description: "",
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
      router.push(
        collabPath(w, p) +
          "/" +
          (kind === "document" ? "docs" : part) +
          "/" +
          r.id,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`New ${kind}`} onClose={onClose}>
      <form onSubmit={submit} className="collab-form">
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
      {canEdit && (
        <div className="actions">
          {origin && (
            <button onClick={() => setKind("document")}>
              <Icon name="note" />
              Write from this
            </button>
          )}
          <button onClick={() => setKind("task")}>Create task</button>
          <button onClick={() => setKind("discussion")}>Discuss</button>
        </div>
      )}
      {compact && (
        <button
          className="related-toggle"
          onClick={() => setShowLinks((v) => !v)}
        >
          Related research
        </button>
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
