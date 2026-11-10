"use client";
import { useRef, useState, useLayoutEffect } from "react";
import { useSafeNavigation } from "./navigation-safety";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { TaskData, Member, ArtifactCard } from "@/lib/collaboration-types";
import { taskStatuses, statusName } from "@/lib/collaboration-types";
import { Icon, InlineError, Modal, useResource } from "./ui";
export function TaskFields({
  value,
  onChange,
  members,
  disabled = false,
  hideTitle = false,
  multilineTitle = false,
}: {
  value: Omit<TaskData, "id" | "revision" | "archivedAt" | "updatedAt">;
  onChange: (v: typeof value) => void;
  members: Member[];
  disabled?: boolean;
  hideTitle?: boolean;
  multilineTitle?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="task-fields">
      {!hideTitle && (
        <label>
          Task title
          {multilineTitle ? (
            <TaskTitle
              value={value.title}
              onChange={(title) => onChange({ ...value, title })}
            />
          ) : (
            <input
              required
              maxLength={300}
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
          )}
        </label>
      )}
      <label>
        Description
        <textarea
          aria-label="Description"
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
function TaskTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const resize = () => {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + "px";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(node);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label="Task title"
      rows={1}
      required
      maxLength={300}
      value={value}
      onChange={(e) => onChange(e.target.value.replaceAll("\n", " "))}
    />
  );
}
export function TaskLinkPicker({
  w,
  p,
  value,
  onChange,
  exclude = [],
}: {
  w: string;
  p: string;
  value: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const data = useResource<ArtifactCard[]>(
    `/api/collaboration/${w}/${p}/artifacts?` +
      new URLSearchParams({ q, selected: value.join(",") }),
  );
  return (
    <div className="task-link-picker">
      <label>
        Find related research
        <input
          aria-label="Find related research"
          value={q}
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this project's sources, notes, writing…"
        />
      </label>
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
          <option value="">Choose a research item…</option>
          {data.data
            ?.filter(
              (c) =>
                !value.includes(c.id) && !exclude.includes(c.id) && !c.archived,
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind} · {c.title}
              </option>
            ))}
        </select>
      </label>
      <div className="selected-links">
        {value.map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => onChange(value.filter((v) => v !== id))}
          >
            {data.data?.find((c) => c.id === id)?.title ?? "Linked research"} ×
          </button>
        ))}
      </div>
      <small>
        Showing up to 50 matching items. Refine the search to find older
        research.
      </small>
      <InlineError error={data.error} />
    </div>
  );
}
export function TaskComposer({
  w,
  p,
  initialStatus = "backlog",
  initialText = "",
  originId,
  origin,
  onClose,
  onCreated,
}: {
  w: string;
  p: string;
  initialStatus?: string;
  initialText?: string;
  originId?: string;
  origin?: { sourceId: string; annotationId?: string };
  onClose: () => void;
  onCreated: (task: TaskData) => void | Promise<void>;
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [value, setValue] = useState({
      title: "",
      description: initialText,
      status: initialStatus,
      priority: "medium",
      assigneeId: null as string | null,
      dueDate: null as string | null,
    }),
    [links, setLinks] = useState(
      originId
        ? [originId]
        : origin
          ? [origin.annotationId ?? origin.sourceId]
          : [],
    ),
    [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<
      (typeof value & { requestId: string; links: string[] }) | null
    >(null),
    sending = useRef(false);
  const members = useResource<{ members: Member[] }>(
    details ? `/api/projects/${p}/members?workspaceId=${w}` : null,
  );
  return (
    <form
      className="task-composer"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        setError(undefined);
        setUncertain(false);
        const payload = pending.current ?? {
          ...value,
          title: value.title.trim(),
          requestId,
          links,
        };
        pending.current = payload;
        try {
          const task = await api<TaskData>(
            `/api/collaboration/${w}/${p}/tasks`,
            payload,
          );
          await onCreated(task);
        } catch (e) {
          if (e instanceof ApiError && [400, 403, 404, 409].includes(e.status))
            pending.current = null;
          setError(e);
          setUncertain(!!pending.current);
        } finally {
          sending.current = false;
          setBusy(false);
        }
      }}
    >
      <label className="sr-only" htmlFor={"new-task-" + requestId}>
        Task title
      </label>
      <input
        id={"new-task-" + requestId}
        aria-label="Task title"
        autoFocus
        required
        maxLength={300}
        placeholder="What is the next step?"
        value={value.title}
        disabled={busy || uncertain}
        onChange={(e) => setValue({ ...value, title: e.target.value })}
      />
      {!!links.length && !details && (
        <p className="muted">Linked research context is included.</p>
      )}
      <button
        className="task-more-fields"
        type="button"
        aria-expanded={details}
        onClick={() => setDetails((v) => !v)}
      >
        <Icon name="options" /> {details ? "Fewer details" : "More details"}
      </button>
      {details && (
        <>
          <TaskFields
            hideTitle
            value={value}
            onChange={setValue}
            members={members.data?.members ?? []}
            disabled={busy || uncertain}
          />
          <fieldset disabled={busy || uncertain}>
            <TaskLinkPicker w={w} p={p} value={links} onChange={setLinks} />
          </fieldset>
        </>
      )}
      <InlineError error={error} />
      {uncertain && (
        <p role="status">
          Your input is kept. Retry this request before changing its details.
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy || !value.title.trim()}>
          {busy ? "Creating…" : error ? "Retry task" : "Create task"}
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
export function TaskCreateDialog({
  w,
  p,
  initialText,
  originId,
  origin,
  onClose,
}: {
  w: string;
  p: string;
  initialText?: string;
  originId?: string;
  origin?: { sourceId: string; annotationId?: string };
  onClose: () => void;
}) {
  const router = useRouter(),
    navigate = useSafeNavigation();
  return (
    <Modal title="New task" onClose={onClose}>
      <TaskComposer
        w={w}
        p={p}
        initialText={initialText}
        originId={originId}
        origin={origin}
        onClose={onClose}
        onCreated={async (task) => {
          onClose();
          const href = `/w/${w}/p/${p}/tasks/${task.id}`;
          await navigate(href, () => router.push(href));
        }}
      />
    </Modal>
  );
}
