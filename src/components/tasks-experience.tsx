"use client";
import { useNavigationBlocker } from "./navigation-safety";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  taskStatuses,
  statusName,
  type TaskData,
  type Member,
  type ArtifactCard,
} from "@/lib/collaboration-types";
import {
  calendarToday,
  dueLabel,
  taskPayload,
  priorities,
} from "@/lib/task-model";
import {
  Icon,
  InlineError,
  Failure,
  Loading,
  Modal,
  PopoverMenu,
  useResource,
} from "./ui";
import { TaskComposer, TaskFields, TaskLinkPicker } from "./task-form";
import { ArtifactCards, CreateArtifactDialog } from "./collaboration-shared";
import { usePageTitle } from "./working-tabs";
type Task = TaskData & { linkCount?: number; linkKinds?: string[] };
type ListData = {
  items: Task[];
  counts: Record<string, number>;
  total: number;
  pageSize: number;
  canEdit: boolean;
  canManage: boolean;
};
type Detail = {
  task: Task;
  links: ArtifactCard[];
  canEdit: boolean;
  canManage: boolean;
};
type Filters = {
  view: "board" | "list";
  q: string;
  status: string;
  assignee: string;
  priority: string;
  due: string;
  completed: boolean;
  archived: boolean;
  sort: string;
  page: number;
  columns: string;
};
type Changes = Partial<
  Pick<
    TaskData,
    "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate"
  >
> & { links?: string[]; archived?: boolean };
function useTaskResource<T>(url: string) {
  const [state, setState] = useState<{
      url: string;
      data?: T;
      error?: unknown;
    }>(),
    seq = useRef(0),
    currentUrl = useRef(url),
    alive = useRef(true),
    denied = useRef(false);
  useLayoutEffect(() => {
    currentUrl.current = url;
  }, [url]);
  const reload = useCallback(async () => {
    const target = currentUrl.current,
      n = ++seq.current;
    try {
      const data = await api<T>(target);
      if (alive.current && n === seq.current && target === currentUrl.current)
        setState({ url: target, data });
      return data;
    } catch (error) {
      if (alive.current && n === seq.current && target === currentUrl.current) {
        const refusal =
          error instanceof ApiError && [401, 403, 404].includes(error.status);
        setState((old) => ({
          url: target,
          error,
          ...(!refusal ? { data: old?.data } : {}),
        }));
        if (refusal && !denied.current) {
          denied.current = true;
          window.dispatchEvent(new Event("atlas-access-changed"));
        }
      }
      return undefined;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void reload();
    const focus = () => void reload(),
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void reload();
      }, 20000);
    window.addEventListener("focus", focus);
    window.addEventListener("atlas-access-changed", focus);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("atlas-access-changed", focus);
    };
  }, [url, reload]);
  return {
    data: state?.data,
    error: state?.error,
    refreshing: state?.url !== url,
    reload,
  };
}
function parseFilters(params: URLSearchParams): Filters {
  return {
    view:
      params.get("view") === "board"
        ? "board"
        : params.get("view") === "list"
          ? "list"
          : typeof window !== "undefined" &&
              matchMedia("(max-width:640px)").matches
            ? "list"
            : "board",
    q: (params.get("q") ?? "").slice(0, 200),
    status: taskStatuses.includes(
      params.get("status") as (typeof taskStatuses)[number],
    )
      ? params.get("status")!
      : "",
    assignee: params.get("assignee") ?? "",
    priority: priorities.includes(
      params.get("priority") as (typeof priorities)[number],
    )
      ? params.get("priority")!
      : "",
    due: ["today", "tomorrow", "overdue", "upcoming", "none"].includes(
      params.get("due") ?? "",
    )
      ? params.get("due")!
      : "",
    completed: params.get("completed") !== "false",
    archived: params.get("archived") === "true",
    sort: ["position", "updated", "title", "due", "priority"].includes(
      params.get("sort") ?? "",
    )
      ? params.get("sort")!
      : "position",
    page: Math.max(0, Number(params.get("page")) || 0),
    columns: /^\d+,\d+,\d+,\d+$/.test(params.get("columns") ?? "")
      ? params.get("columns")!
      : "0,0,0,0",
  };
}
function paramsFor(f: Filters) {
  return new URLSearchParams(
    Object.entries(f).map(([k, v]) => [k, String(v)]),
  ).toString();
}
const smallQuery = "(max-width:1000px)";
function subscribeSmall(fn: () => void) {
  const m = matchMedia(smallQuery);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}
export function TasksExperience({
  w,
  p,
  userId,
  initialId,
}: {
  w: string;
  p: string;
  userId: string;
  initialId?: string;
}) {
  const query = useSearchParams(),
    pathname = usePathname(),
    base = `/w/${w}/p/${p}/tasks`,
    endpoint = `/api/collaboration/${w}/${p}/tasks`,
    key = `atlas-tasks:${userId}/${w}/${p}`;
  const [filter, setFilter] = useState(() => {
      const raw = query.get("context") ?? query.toString();
      if (raw) return parseFilters(new URLSearchParams(raw));
      try {
        return parseFilters(
          new URLSearchParams(sessionStorage.getItem(key) ?? ""),
        );
      } catch {
        return parseFilters(new URLSearchParams());
      }
    }),
    [selected, setSelected] = useState<string | null>(
      pathname.startsWith(base + "/")
        ? pathname.slice(base.length + 1)
        : (initialId ?? query.get("task")),
    ),
    [today, setToday] = useState(calendarToday),
    [term, setTerm] = useState(filter.q),
    [creating, setCreating] = useState(false),
    [quick, setQuick] = useState<string | null>(null),
    [mobileColumn, setMobileColumn] = useState("backlog"),
    [busy, setBusy] = useState<string | null>(null),
    [failure, setFailure] = useState<{
      id: string;
      payload: Record<string, unknown>;
      error: unknown;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [dragging, setDragging] = useState<string | null>(null),
    [drop, setDrop] = useState<{
      status: string;
      beforeId?: string | null;
      afterId?: string;
    } | null>(null);
  const small = useSyncExternalStore(
      subscribeSmall,
      () => matchMedia(smallQuery).matches,
      () => false,
    ),
    params = paramsFor(filter);
  useEffect(() => {
    const t = setTimeout(() => setTerm(filter.q), 250);
    return () => clearTimeout(t);
  }, [filter.q]);
  useEffect(() => {
    const tick = () => setToday(calendarToday());
    const timer = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const apiParams = new URLSearchParams(params);
  apiParams.set("q", term);
  apiParams.set("today", today);
  const data = useTaskResource<ListData>(endpoint + "?" + apiParams),
    members = useResource<{ members: Member[] }>(
      `/api/projects/${p}/members?workspaceId=${w}`,
    );
  const change = (next: Partial<Filters>) => {
    setFilter((f) => ({ ...f, ...next, page: 0, columns: "0,0,0,0" }));
    setNotice("");
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(key, params);
    } catch {}
    const target = selected
      ? base + "/" + selected + "?context=" + encodeURIComponent(params)
      : base + "?" + params;
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new Event("atlas-location-changed"));
  }, [base, key, params, selected]);
  useEffect(() => {
    const back = () => {
      const u = new URL(location.href),
        id = u.pathname.split("/tasks/")[1];
      setSelected(id ?? null);
      setFilter(
        parseFilters(
          new URLSearchParams(u.searchParams.get("context") ?? u.search),
        ),
      );
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const open = (id: string) => {
    if (
      selected &&
      selected !== id &&
      !window.dispatchEvent(
        new CustomEvent("atlas-task-close", {
          cancelable: true,
          detail: selected,
        }),
      )
    )
      return;
    window.history.pushState(
      null,
      "",
      base + "/" + id + "?context=" + encodeURIComponent(params),
    );
    setSelected(id);
  };
  const close = (force = false) => {
    if (
      !force &&
      !window.dispatchEvent(
        new CustomEvent("atlas-task-close", {
          cancelable: true,
          detail: selected,
        }),
      )
    )
      return;
    setSelected(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-task="${selected}"] .task-title-link`,
        )
        ?.focus(),
    );
  };
  const sending = useRef(false);
  async function mutate(id: string, payload: Record<string, unknown>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(id);
    setFailure(null);
    setNotice("Saving task…");
    try {
      await api(endpoint + "/" + id, payload, "PATCH");
      await data.reload();
      setNotice("Task saved");
    } catch (error) {
      setFailure({ id, payload, error });
      setNotice("Save not confirmed. Your task and retry action are retained.");
    } finally {
      sending.current = false;
      setBusy(null);
      setDrop(null);
      setDragging(null);
    }
  }
  const edit = (task: Task, changes: Changes) =>
    void mutate(task.id, {
      action: "edit",
      requestId: crypto.randomUUID(),
      revision: task.revision,
      changes,
    });
  function move(task: Task, target: NonNullable<typeof drop>) {
    if (target.beforeId === task.id || target.afterId === task.id) return;
    void mutate(task.id, {
      action: "move",
      requestId: crypto.randomUUID(),
      revision: task.revision,
      ...target,
    });
  }
  const handleDrop = (
    event: React.DragEvent,
    target: NonNullable<typeof drop>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("application/atlas-task");
    const t = data.data?.items.find((t) => t.id === id);
    if (
      t &&
      data.data?.canEdit &&
      filter.sort === "position" &&
      !filter.archived
    )
      move(t, target);
    else {
      setDrop(null);
      setDragging(null);
    }
  };
  const rows = data.data?.items ?? [],
    names = members.data?.members ?? [],
    total = data.data?.total ?? 0,
    canEdit = data.data?.canEdit ?? false;
  const filterCount = [
    filter.q,
    filter.status,
    filter.assignee,
    filter.priority,
    filter.due,
    filter.archived,
    !filter.completed,
  ].filter(Boolean).length;
  const composed = async (task: TaskData) => {
    setCreating(false);
    setQuick(null);
    await data.reload();
    setNotice("Task created");
    open(task.id);
  };
  const panel = selected ? (
    <TaskPanel
      key={selected}
      w={w}
      p={p}
      id={selected}
      members={names}
      today={today}
      close={() => close(true)}
      changed={() => data.reload()}
    />
  ) : null;
  return (
    <div className="tasks-experience">
      <header className="tasks-controls">
        <h1>Tasks</h1>
        <div className="segmented" aria-label="Task views">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={filter.view === v}
              onClick={() => change({ view: v })}
            >
              <Icon name={v === "board" ? "grid" : "list"} />
              {v === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>
        <label className="tasks-search">
          <Icon name="search" />
          <input
            aria-label="Search tasks"
            value={filter.q}
            maxLength={200}
            placeholder="Search tasks…"
            onChange={(e) => change({ q: e.target.value })}
          />
        </label>
        <PopoverMenu className="action-menu task-filter-menu">
          <summary className="toolbar-button">
            <Icon name="filter" /> Filters
            {filterCount ? " · " + filterCount : ""}
          </summary>
          <div className="task-filter-fields">
            <label>
              Status
              <select
                aria-label="Filter status"
                value={filter.status}
                onChange={(e) => change({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                {taskStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusName(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                aria-label="Filter assignee"
                value={filter.assignee}
                onChange={(e) => change({ assignee: e.target.value })}
              >
                <option value="">All assignees</option>
                <option value="mine">Assigned to me</option>
                <option value="none">Unassigned</option>
                {names
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Priority
              <select
                aria-label="Filter priority"
                value={filter.priority}
                onChange={(e) => change({ priority: e.target.value })}
              >
                <option value="">All priorities</option>
                {priorities.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <select
                aria-label="Filter due date"
                value={filter.due}
                onChange={(e) => change({ due: e.target.value })}
              >
                <option value="">Any date</option>
                {["today", "tomorrow", "overdue", "upcoming", "none"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s === "upcoming"
                        ? "Next 7 days"
                        : s === "none"
                          ? "No due date"
                          : s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="compact-check">
              <input
                type="checkbox"
                checked={filter.completed}
                onChange={(e) => change({ completed: e.target.checked })}
              />{" "}
              Show completed
            </label>
            <label className="compact-check">
              <input
                type="checkbox"
                checked={filter.archived}
                onChange={(e) => change({ archived: e.target.checked })}
              />{" "}
              Archived
            </label>
          </div>
        </PopoverMenu>
        <select
          className="tasks-sort"
          aria-label="Sort tasks"
          value={filter.sort}
          onChange={(e) => change({ sort: e.target.value })}
        >
          <option value="position">Board order</option>
          <option value="due">Due date</option>
          <option value="priority">Priority</option>
          <option value="updated">Last edited</option>
          <option value="title">Title A–Z</option>
        </select>
        {canEdit && (
          <button
            className="primary tasks-new"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" /> New task
          </button>
        )}
      </header>
      <div className="tasks-work">
        <div className="tasks-canvas" aria-busy={data.refreshing || !!busy}>
          {!!filterCount && (
            <div className="task-filter-chips">
              {filter.q && (
                <button onClick={() => change({ q: "" })}>
                  “{filter.q}” ×
                </button>
              )}
              {filter.status && (
                <button onClick={() => change({ status: "" })}>
                  {statusName(filter.status)} ×
                </button>
              )}
              {filter.assignee && (
                <button onClick={() => change({ assignee: "" })}>
                  {filter.assignee === "mine"
                    ? "Assigned to me"
                    : filter.assignee === "none"
                      ? "Unassigned"
                      : (names.find((m) => m.userId === filter.assignee)
                          ?.name ?? "Assignee")}{" "}
                  ×
                </button>
              )}
              {filter.priority && (
                <button onClick={() => change({ priority: "" })}>
                  {filter.priority} ×
                </button>
              )}
              {filter.due && (
                <button onClick={() => change({ due: "" })}>
                  {filter.due === "upcoming" ? "Next 7 days" : filter.due} ×
                </button>
              )}
              {!filter.completed && (
                <button onClick={() => change({ completed: true })}>
                  Completed hidden ×
                </button>
              )}
              {filter.archived && (
                <button onClick={() => change({ archived: false })}>
                  Archived ×
                </button>
              )}
              <button
                onClick={() =>
                  change({
                    q: "",
                    status: "",
                    assignee: "",
                    priority: "",
                    due: "",
                    completed: true,
                    archived: false,
                  })
                }
              >
                Clear filters
              </button>
            </div>
          )}
          <div className="tasks-feedback" role="status">
            {data.refreshing && data.data ? "Updating tasks…" : notice}
            {!notice && !data.refreshing && data.data
              ? `${total} ${total === 1 ? "task" : "tasks"}${filter.completed ? " · includes completed" : " · active only"}`
              : ""}
          </div>
          {failure && (
            <div className="task-save-error" role="alert">
              <InlineError error={failure.error} />
              <button
                disabled={!!busy}
                onClick={() => void mutate(failure.id, failure.payload)}
              >
                Retry change
              </button>
              {failure.error instanceof ApiError &&
                failure.error.status === 409 && (
                  <button
                    onClick={() => {
                      open(failure.id);
                      setFailure(null);
                    }}
                  >
                    Review latest task
                  </button>
                )}
            </div>
          )}
          {!!data.error && data.data && (
            <div className="task-save-error">
              <InlineError error={data.error} />
              <button onClick={() => void data.reload()}>Retry refresh</button>
            </div>
          )}
          {!data.data ? (
            data.error ? (
              <Failure error={data.error} retry={() => void data.reload()} />
            ) : (
              <Loading />
            )
          ) : (
            <>
              {!total && (
                <div className="empty tasks-empty">
                  <Icon name="check" />
                  <h2>
                    {filterCount
                      ? "No matching tasks"
                      : filter.archived
                        ? "No archived tasks"
                        : "What is the next research step?"}
                  </h2>
                  <p>
                    {filterCount
                      ? "Try another search or clear the active filters."
                      : "Create a task or start from a source, PDF note or document."}
                  </p>
                  {canEdit && !filter.archived && (
                    <button onClick={() => setCreating(true)}>New task</button>
                  )}
                </div>
              )}
              {filter.view === "board" ? (
                <>
                  <nav
                    className="task-mobile-columns"
                    aria-label="Board columns"
                  >
                    <select
                      aria-label="Board column"
                      value={mobileColumn}
                      onChange={(e) => setMobileColumn(e.target.value)}
                    >
                      {taskStatuses.map((s) => (
                        <option key={s} value={s}>
                          {statusName(s)} · {data.data?.counts[s] ?? 0}
                        </option>
                      ))}
                    </select>
                  </nav>
                  {filter.sort !== "position" && (
                    <p className="muted task-order-hint">
                      Choose Board order to drag and reorder cards.
                    </p>
                  )}
                  <div className="task-board task-board-experience">
                    {taskStatuses.map((s, index) => {
                      const items = rows.filter((t) => t.status === s),
                        count = data.data!.counts[s] ?? 0,
                        page = Number(filter.columns.split(",")[index]);
                      return (
                        <section
                          key={s}
                          data-status={s}
                          data-mobile-active={mobileColumn === s}
                          className={
                            "task-column " +
                            (drop?.status === s &&
                            !drop.beforeId &&
                            !drop.afterId
                              ? "drop-column"
                              : "")
                          }
                          onDragOver={(e) => {
                            if (dragging && filter.sort === "position") {
                              e.preventDefault();
                              if (
                                !(e.target as HTMLElement).closest(
                                  "[data-task]",
                                )
                              )
                                setDrop({ status: s, beforeId: null });
                            }
                          }}
                          onDrop={(e) =>
                            handleDrop(
                              e,
                              drop?.status === s
                                ? drop
                                : { status: s, beforeId: null },
                            )
                          }
                        >
                          <header>
                            <h2>
                              <span className={"status-dot " + s} />
                              {statusName(s)}
                              <small>{count}</small>
                            </h2>
                            {canEdit && !filter.archived && (
                              <button
                                className="icon-button"
                                aria-label={"Add task to " + statusName(s)}
                                onClick={() => setQuick(s)}
                              >
                                <Icon name="plus" />
                              </button>
                            )}
                          </header>
                          {quick === s && (
                            <TaskComposer
                              w={w}
                              p={p}
                              initialStatus={s}
                              onClose={() => setQuick(null)}
                              onCreated={composed}
                            />
                          )}
                          <div className="task-column-cards">
                            {items.map((t) => (
                              <article
                                className={
                                  "task-card task-experience-card " +
                                  (selected === t.id ? "selected " : "") +
                                  (busy === t.id ? "saving " : "") +
                                  (drop?.beforeId === t.id
                                    ? "drop-before "
                                    : drop?.afterId === t.id
                                      ? "drop-after "
                                      : "")
                                }
                                key={t.id}
                                data-task={t.id}
                                draggable={
                                  canEdit &&
                                  !filter.archived &&
                                  filter.sort === "position" &&
                                  !busy
                                }
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/atlas-task",
                                    t.id,
                                  );
                                  e.dataTransfer.effectAllowed = "move";
                                  setDragging(t.id);
                                }}
                                onDragEnd={() => {
                                  setDragging(null);
                                  setDrop(null);
                                }}
                                onDragOver={(e) => {
                                  if (dragging && dragging !== t.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const r =
                                      e.currentTarget.getBoundingClientRect();
                                    setDrop(
                                      e.clientY < r.top + r.height / 2
                                        ? { status: s, beforeId: t.id }
                                        : { status: s, afterId: t.id },
                                    );
                                  }
                                }}
                                onDrop={(e) =>
                                  handleDrop(
                                    e,
                                    drop ?? { status: s, beforeId: t.id },
                                  )
                                }
                              >
                                <div className="task-card-top">
                                  <Priority value={t.priority} />
                                  <Assignee task={t} members={names} />
                                </div>
                                <a
                                  className="task-title-link"
                                  href={
                                    base +
                                    "/" +
                                    t.id +
                                    "?context=" +
                                    encodeURIComponent(params)
                                  }
                                  draggable={false}
                                  onClick={(e) => {
                                    if (!e.metaKey && !e.ctrlKey) {
                                      e.preventDefault();
                                      open(t.id);
                                    }
                                  }}
                                >
                                  {t.title}
                                </a>
                                <div className="task-card-bottom">
                                  {t.dueDate && (
                                    <time
                                      className={
                                        t.status !== "done" && t.dueDate < today
                                          ? "overdue"
                                          : ""
                                      }
                                      dateTime={t.dueDate}
                                    >
                                      {dueLabel(t, today)}
                                    </time>
                                  )}
                                  <ResearchCount task={t} />
                                  <div className="task-card-menu">
                                    {canEdit && !t.archivedAt && (
                                      <PopoverMenu className="action-menu task-move-menu">
                                        <summary
                                          className="icon-button"
                                          aria-label={"Move or edit " + t.title}
                                        >
                                          <Icon name="options" />
                                        </summary>
                                        <div>
                                          <button onClick={() => open(t.id)}>
                                            Open task details
                                          </button>
                                          <label>
                                            Status
                                            <select
                                              aria-label={
                                                "Status for " + t.title
                                              }
                                              value={t.status}
                                              disabled={!!busy}
                                              onChange={(e) =>
                                                edit(t, {
                                                  status: e.target.value,
                                                })
                                              }
                                            >
                                              {taskStatuses.map((s) => (
                                                <option key={s} value={s}>
                                                  {statusName(s)}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>
                                      </PopoverMenu>
                                    )}
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                          {!items.length && total > 0 && (
                            <p className="column-empty">
                              {count
                                ? "No cards on this page"
                                : s === "done" && !filter.completed
                                  ? "Completed tasks are hidden"
                                  : "No tasks"}
                            </p>
                          )}
                          {count > data.data!.pageSize && (
                            <div className="task-column-pages">
                              <button
                                disabled={!page}
                                onClick={() => {
                                  const a = filter.columns.split(",");
                                  a[index] = String(page - 1);
                                  setFilter({
                                    ...filter,
                                    columns: a.join(","),
                                  });
                                }}
                              >
                                Previous
                              </button>
                              <small>
                                {page + 1} /{" "}
                                {Math.ceil(count / data.data!.pageSize)}
                              </small>
                              <button
                                disabled={
                                  (page + 1) * data.data!.pageSize >= count
                                }
                                onClick={() => {
                                  const a = filter.columns.split(",");
                                  a[index] = String(page + 1);
                                  setFilter({
                                    ...filter,
                                    columns: a.join(","),
                                  });
                                }}
                              >
                                Next
                              </button>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="task-list-view">
                  <div className="task-list-head">
                    <span>Task</span>
                    <span>Status</span>
                    <span>Assignee</span>
                    <span>Priority</span>
                    <span>Due date</span>
                  </div>
                  {canEdit &&
                    !filter.archived &&
                    (quick === "list" ? (
                      <TaskComposer
                        w={w}
                        p={p}
                        onClose={() => setQuick(null)}
                        onCreated={composed}
                      />
                    ) : (
                      <button
                        className="task-list-add"
                        onClick={() => setQuick("list")}
                      >
                        <Icon name="plus" /> Add task
                      </button>
                    ))}
                  {rows.map((t) => (
                    <TaskListRow
                      key={t.id}
                      task={t}
                      members={names}
                      today={today}
                      canEdit={canEdit && !t.archivedAt}
                      disabled={!!busy}
                      href={
                        base +
                        "/" +
                        t.id +
                        "?context=" +
                        encodeURIComponent(params)
                      }
                      open={() => open(t.id)}
                      edit={(changes) => edit(t, changes)}
                    />
                  ))}
                  {total > data.data.pageSize && (
                    <nav className="task-list-pages" aria-label="Task pages">
                      <button
                        disabled={!filter.page}
                        onClick={() =>
                          setFilter({ ...filter, page: filter.page - 1 })
                        }
                      >
                        Previous
                      </button>
                      <span>
                        Page {filter.page + 1} of{" "}
                        {Math.ceil(total / data.data.pageSize)}
                      </span>
                      <button
                        disabled={
                          (filter.page + 1) * data.data.pageSize >= total
                        }
                        onClick={() =>
                          setFilter({ ...filter, page: filter.page + 1 })
                        }
                      >
                        Next
                      </button>
                    </nav>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {selected && !small && (
          <aside className="task-detail-rail" aria-label="Task details">
            {panel}
          </aside>
        )}
      </div>
      {selected && small && (
        <Modal title="Task details" onClose={() => close()}>
          {panel}
        </Modal>
      )}
      {creating && (
        <Modal title="New task" onClose={() => setCreating(false)}>
          <TaskComposer
            w={w}
            p={p}
            onClose={() => setCreating(false)}
            onCreated={composed}
          />
        </Modal>
      )}
    </div>
  );
}
function Priority({ value }: { value: string }) {
  return (
    <span
      className={"task-priority " + value}
      title={value + " priority"}
      aria-label={value + " priority"}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
function Assignee({ task, members }: { task: Task; members: Member[] }) {
  const name = members.find((m) => m.userId === task.assigneeId)?.name;
  return (
    <span
      className="task-assignee"
      title={name ?? "Unassigned"}
      aria-label={name ? "Assigned to " + name : "Unassigned"}
    >
      {name ? (
        <span className="task-avatar">
          {name
            .split(/\s+/)
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </span>
      ) : (
        <span className="task-unassigned">—</span>
      )}
    </span>
  );
}
function ResearchCount({ task }: { task: Task }) {
  return task.linkCount ? (
    <span
      className="task-research-count"
      title={task.linkCount + " linked research items"}
    >
      <Icon name="link" />
      {task.linkCount}
    </span>
  ) : null;
}
function TaskListRow({
  task: t,
  members,
  today,
  canEdit,
  disabled,
  href,
  open,
  edit,
}: {
  task: Task;
  members: Member[];
  today: string;
  canEdit: boolean;
  disabled: boolean;
  href: string;
  open: () => void;
  edit: (v: Changes) => void;
}) {
  const [date, setDate] = useState({ base: t.dueDate, value: t.dueDate ?? "" }),
    dateValue = date.base === t.dueDate ? date.value : (t.dueDate ?? "");
  return (
    <div className="task-list-row" data-task={t.id}>
      <div className="task-list-title">
        <input
          aria-label={"Complete " + t.title}
          type="checkbox"
          checked={t.status === "done"}
          disabled={!canEdit || disabled}
          onChange={(e) =>
            edit({ status: e.target.checked ? "done" : "backlog" })
          }
        />
        <a
          className="task-title-link"
          href={href}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              open();
            }
          }}
        >
          {t.title}
        </a>
        <ResearchCount task={t} />
      </div>
      <label>
        <span className="sr-only">Status</span>
        <select
          aria-label={"Status for " + t.title}
          disabled={!canEdit || disabled}
          value={t.status}
          onChange={(e) => edit({ status: e.target.value })}
        >
          {taskStatuses.map((s) => (
            <option key={s} value={s}>
              {statusName(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Assignee</span>
        <select
          aria-label={"Assignee for " + t.title}
          disabled={!canEdit || disabled}
          value={t.assigneeId ?? ""}
          onChange={(e) => edit({ assigneeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {members
            .filter((m) => m.active && m.role !== "viewer")
            .map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Priority</span>
        <select
          aria-label={"Priority for " + t.title}
          disabled={!canEdit || disabled}
          value={t.priority}
          onChange={(e) => edit({ priority: e.target.value })}
        >
          {priorities.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label
        className={
          t.status !== "done" && t.dueDate && t.dueDate < today
            ? "task-date overdue"
            : "task-date"
        }
        title={dueLabel(t, today)}
      >
        <span className="sr-only">Due date</span>
        <input
          type="date"
          aria-label={"Due date for " + t.title}
          disabled={!canEdit || disabled}
          value={dateValue}
          onChange={(e) => setDate({ base: t.dueDate, value: e.target.value })}
          onBlur={() => {
            if (dateValue !== (t.dueDate ?? ""))
              edit({ dueDate: dateValue || null });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDate({ base: t.dueDate, value: t.dueDate ?? "" });
              e.stopPropagation();
            }
          }}
        />
      </label>
    </div>
  );
}
function TaskPanel({
  w,
  p,
  id,
  members,
  today,
  close,
  changed,
}: {
  w: string;
  p: string;
  id: string;
  members: Member[];
  today: string;
  close: () => void;
  changed: () => Promise<unknown>;
}) {
  const endpoint = `/api/collaboration/${w}/${p}/tasks/${id}`,
    data = useTaskResource<Detail>(endpoint);
  if (!data.data)
    return data.error ? (
      <Failure error={data.error} retry={() => void data.reload()} />
    ) : (
      <Loading />
    );
  return (
    <TaskEditor
      key={id}
      w={w}
      p={p}
      detail={data.data}
      members={members}
      today={today}
      close={close}
      refresh={async () => {
        const result = await data.reload();
        await changed();
        return result;
      }}
      readError={data.error}
    />
  );
}
function TaskEditor({
  w,
  p,
  detail,
  members,
  today,
  close,
  refresh,
  readError,
}: {
  w: string;
  p: string;
  detail: Detail;
  members: Member[];
  today: string;
  close: () => void;
  refresh: () => Promise<Detail | undefined>;
  readError?: unknown;
}) {
  const endpoint = `/api/collaboration/${w}/${p}/tasks/${detail.task.id}`;
  const [base, setBase] = useState(detail.task),
    [value, setValue] = useState(taskPayload(detail.task)),
    [links, setLinks] = useState<string[]>([]),
    [linking, setLinking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [status, setStatus] = useState("Saved"),
    [remote, setRemote] = useState<Detail | null>(null),
    [discussion, setDiscussion] = useState(false),
    [askClose, setAskClose] = useState(false),
    [uncertain, setUncertain] = useState(false),
    pending = useRef<Record<string, unknown> | null>(null),
    sending = useRef(false);
  const dirty =
    Object.keys(taskPayload(base)).some(
      (k) =>
        k !== "revision" &&
        JSON.stringify(value[k as keyof typeof value]) !==
          JSON.stringify(taskPayload(base)[k as keyof typeof value]),
    ) || links.length > 0;
  useEffect(() => {
    const guard = (e: Event) => {
      if (
        (e as CustomEvent).detail === detail.task.id &&
        (dirty || pending.current)
      ) {
        e.preventDefault();
        setAskClose(true);
      }
    };
    window.addEventListener("atlas-task-close", guard);
    return () => window.removeEventListener("atlas-task-close", guard);
  }, [detail.task.id, dirty]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  usePageTitle(value.title);
  function changes(): Changes {
    const original = taskPayload(base),
      fields = Object.fromEntries(
        Object.entries(value).filter(
          ([k, v]) =>
            k !== "revision" &&
            JSON.stringify(v) !==
              JSON.stringify(original[k as keyof typeof original]),
        ),
      ) as Changes;
    return { ...fields, ...(links.length ? { links } : {}) };
  }
  async function save(extra?: Changes) {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    setStatus("Saving…");
    setUncertain(false);
    const payload = pending.current ?? {
      action: "edit",
      requestId: crypto.randomUUID(),
      revision: base.revision,
      changes: extra ?? changes(),
    };
    pending.current = payload;
    try {
      const next = await api<Task>(endpoint, payload, "PATCH");
      setBase(next);
      setValue(taskPayload(next));
      setLinks([]);
      setRemote(null);
      pending.current = null;
      setStatus("Saved");
      await refresh();
      return true;
    } catch (e) {
      setError(e);
      setUncertain(
        !(e instanceof ApiError && [400, 403, 404, 409].includes(e.status)),
      );
      setStatus(
        e instanceof ApiError && e.status === 409 ? "Conflict" : "Not saved",
      );
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        const latest = await refresh();
        if (latest) setRemote(latest);
      } else if (e instanceof ApiError && [400, 403, 404].includes(e.status))
        pending.current = null;
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  useNavigationBlocker({
    label:
      "Task changes are not saved. Stay to review or use the task's explicit discard action.",
    pending: () => dirty || !!pending.current,
    flush: async () => (await save()) === true,
  });
  return (
    <div
      className="task-editor"
      onClickCapture={(e) => {
        if (dirty && (e.target as HTMLElement).closest("a")) {
          e.preventDefault();
          setAskClose(true);
        }
      }}
    >
      <header>
        <span>
          <Icon name="check" />
          Task {detail.task.archivedAt ? "· Archived" : ""}
        </span>
        <button
          className="icon-button"
          aria-label="Close task details"
          onClick={() => {
            if (dirty || pending.current) setAskClose(true);
            else close();
          }}
        >
          <Icon name="close" />
        </button>
      </header>
      {askClose && (
        <div className="task-save-error" role="alert">
          <p>Your task changes have not been saved.</p>
          <button onClick={() => setAskClose(false)}>Keep editing</button>
          <button onClick={close}>Discard changes and close</button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty || pending.current) void save();
        }}
      >
        <TaskFields
          multilineTitle
          value={value}
          onChange={(v) => {
            setValue({ ...v, revision: base.revision });
            setStatus("Unsaved changes");
          }}
          members={members}
          disabled={!detail.canEdit || busy || uncertain}
        />
        <p className="task-due-label">{dueLabel(value, today)}</p>
        <InlineError error={error ?? readError} />
        <div className="task-editor-save">
          <span role="status">
            {detail.canEdit
              ? status
              : detail.task.archivedAt
                ? "Archived"
                : "Read only"}
          </span>
          {detail.canEdit && (
            <button
              className="primary"
              disabled={busy || (!dirty && !uncertain)}
            >
              {busy ? "Saving…" : error ? "Retry save" : "Save task"}
            </button>
          )}
        </div>
      </form>
      {detail.task.revision !== base.revision && !dirty && !remote && (
        <button
          onClick={() => {
            setBase(detail.task);
            setValue(taskPayload(detail.task));
            pending.current = null;
            setStatus("Saved");
          }}
        >
          Load latest task
        </button>
      )}
      {remote && (
        <section className="task-conflict">
          <h3>Review the latest task</h3>
          <p>
            Your edits are kept. Review the current server copy before retrying.
          </p>
          <textarea
            aria-label="Latest server task"
            readOnly
            value={[
              remote.task.title,
              remote.task.description,
              statusName(remote.task.status),
              remote.task.priority,
              members.find((m) => m.userId === remote.task.assigneeId)?.name ??
                "Unassigned",
              remote.task.dueDate ?? "No due date",
            ].join("\n\n")}
          />
          <button
            onClick={() => {
              const draft = changes();
              setBase(remote.task);
              setValue({
                ...taskPayload(remote.task),
                ...draft,
                revision: remote.task.revision,
              });
              setRemote(null);
              setError(undefined);
              setStatus("Unsaved changes");
            }}
          >
            Keep my changed fields for review
          </button>
          <button
            onClick={() => {
              setBase(remote.task);
              setValue(taskPayload(remote.task));
              setLinks([]);
              setRemote(null);
              setError(undefined);
              setStatus("Saved");
            }}
          >
            Use latest task
          </button>
        </section>
      )}
      <section className="task-linked">
        <h2>Linked research</h2>
        <ArtifactCards items={detail.links} />
        {!detail.links.length && (
          <p className="muted">
            Connect this step to its source, writing or discussion.
          </p>
        )}
        {detail.canEdit && (
          <button onClick={() => setLinking((v) => !v)}>
            <Icon name="plus" /> Add research link
          </button>
        )}
        {linking && detail.canEdit && (
          <>
            <TaskLinkPicker
              w={w}
              p={p}
              value={links}
              onChange={(ids) => {
                setLinks(ids);
                setStatus("Unsaved changes");
              }}
              exclude={[detail.task.id, ...detail.links.map((c) => c.id)]}
            />
          </>
        )}
      </section>
      <footer>
        <small>
          Created{" "}
          {detail.task.createdAt
            ? new Date(detail.task.createdAt).toLocaleString()
            : "—"}
          <br />
          Edited {new Date(detail.task.updatedAt).toLocaleString()}
        </small>
        <Link href={`/w/${w}/p/${p}/tasks/${detail.task.id}`}>
          Permanent task link
        </Link>
        {detail.canEdit && (
          <button disabled={busy || dirty} onClick={() => setDiscussion(true)}>
            Discuss this task
          </button>
        )}
        {dirty && <small>Save changes before starting a discussion.</small>}
        {detail.canManage && (
          <button
            disabled={busy || dirty}
            onClick={() => void save({ archived: !detail.task.archivedAt })}
          >
            {detail.task.archivedAt ? "Restore task" : "Archive task"}
          </button>
        )}
      </footer>
      {discussion && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind="discussion"
          originId={detail.task.id}
          onClose={() => setDiscussion(false)}
        />
      )}
    </div>
  );
}
