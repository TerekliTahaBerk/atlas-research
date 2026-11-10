"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceShell, CreateDialog, projectPath } from "./workspace-shell";
import { Failure, Icon, InlineError, Loading, Modal, useResource } from "./ui";
import type { HomeDashboard } from "@/lib/dashboard-types";
import {
  DashboardTasks,
  displayDate,
  useCalendarToday,
} from "./dashboard-shared";
import { flushWorkVisits } from "./work-visit";
type Filter = {
  status: string;
  workspace: string;
  kind: string;
  sort: string;
  q: string;
  page: number;
};
export function HomeExperience({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  return (
    <WorkspaceShell title={onboarding ? "Welcome" : "Home"}>
      {(context) => (
        <PersonalHome
          key={context.me.user.id}
          onboarding={onboarding}
          context={context}
        />
      )}
    </WorkspaceShell>
  );
}
function PersonalHome({
  context,
  onboarding,
}: {
  context: Parameters<Parameters<typeof WorkspaceShell>[0]["children"]>[0];
  onboarding: boolean;
}) {
  const { me, workspaces, projects, reload } = context,
    router = useRouter(),
    today = useCalendarToday(),
    key = `atlas-home-v2:${me.user.id}`;
  const [filter, setFilter] = useState<Filter>(() => {
      try {
        return {
          ...{
            workspace: "all",
            kind: "all",
            sort: "updated",
            status: "active",
            q: "",
            page: 0,
          },
          ...JSON.parse(sessionStorage.getItem(key) ?? "{}"),
        };
      } catch {
        return {
          workspace: "all",
          kind: "all",
          sort: "updated",
          status: "active",
          q: "",
          page: 0,
        };
      }
    }),
    [layout, setLayout] = useState<"grid" | "list">(() => {
      try {
        return sessionStorage.getItem(key + ":layout") === "list"
          ? "list"
          : "grid";
      } catch {
        return "grid";
      }
    }),
    [query, setQuery] = useState(filter.q),
    [create, setCreate] = useState<"project" | "workspace" | null>(null),
    [starting, setStarting] = useState(false),
    [destination, setDestination] = useState(""),
    [tasksView, setTasksView] = useState("assigned");
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(filter));
    } catch {}
    const timer = setTimeout(() => setQuery(filter.q), 250);
    return () => clearTimeout(timer);
  }, [key, filter]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key + ":layout", layout);
    } catch {}
  }, [key, layout]);
  const params = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filter).map(([k, v]) => [k, String(v)]),
    ),
    q: query,
    today,
    view: "personal",
  });
  const data = useResource<HomeDashboard>("/api/home?" + params, true, true);
  const refresh = data.reload;
  useEffect(() => {
    void flushWorkVisits().then(refresh);
  }, [refresh]);
  const active = projects.filter(
    (p) =>
      !p.archivedAt &&
      !p.deletedAt &&
      (filter.workspace === "all" || p.workspaceId === filter.workspace) &&
      (filter.kind === "all" ||
        workspaces.find((w) => w.id === p.workspaceId)?.kind === filter.kind),
  );
  const change = (next: Partial<Filter>) =>
    setFilter({ ...filter, ...next, page: 0 });
  return (
    <div className="home-surface personal-home">
      <header className="personal-home-heading">
        <div>
          <small>Your workspace</small>
          <h1>
            {onboarding
              ? "Welcome to Atlas"
              : `Welcome back, ${me.user.name.split(" ")[0]}`}
          </h1>
          <p>Pick up your work, then plan your next research step.</p>
        </div>
        <div className="actions">
          <button onClick={() => setStarting(true)}>Start work</button>
          <button className="primary" onClick={() => setCreate("project")}>
            <Icon name="plus" /> New project
          </button>
        </div>
      </header>
      <div className="home-viewbar">
        <div className="segmented" role="group" aria-label="Workspace scope">
          {["all", "personal", "shared"].map((kind) => (
            <button
              key={kind}
              aria-pressed={filter.kind === kind}
              onClick={() => change({ kind })}
            >
              {kind === "all"
                ? "All workspaces"
                : kind === "personal"
                  ? "Personal"
                  : "Shared"}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">Workspace</span>
          <select
            aria-label="Workspace"
            value={filter.workspace}
            onChange={(e) => change({ workspace: e.target.value })}
          >
            <option value="all">All workspaces</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {(filter.workspace !== "all" || filter.kind !== "all" || filter.q) && (
          <button
            onClick={() =>
              setFilter({
                workspace: "all",
                kind: "all",
                sort: "updated",
                status: "active",
                q: "",
                page: 0,
              })
            }
          >
            Reset filters
          </button>
        )}
      </div>
      {!!data.error && <InlineError error={data.error} />}{" "}
      {!data.data ? (
        data.error ? (
          <Failure error={data.error} retry={refresh} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <section className="home-resume">
            <div className="section-heading">
              <h2>Continue working</h2>
              <small>Opened by you</small>
            </div>
            {data.data.recent.length ? (
              <div className="continue-grid">
                {data.data.recent.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="home-resume-card"
                  >
                    <span className="continue-icon">
                      <Icon name={item.kind === "document" ? "note" : "book"} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.projectName} ·{" "}
                        {item.kind === "document"
                          ? "Document"
                          : item.version
                            ? `PDF v${item.version}${item.page ? " · page " + item.page : ""}`
                            : "Source"}
                      </small>
                      <small>
                        Opened {displayDate(item.openedAt)}
                        {Date.parse(item.updatedAt) > Date.parse(item.openedAt)
                          ? ` · Updated ${displayDate(item.updatedAt)}`
                          : ""}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <p>
                  No recently opened papers or documents in this workspace
                  scope.
                </p>
                <p>
                  Open a project to begin. Your own recent work will appear
                  here.
                </p>
              </div>
            )}
          </section>
          <section className="home-personal-tasks">
            <div className="section-heading">
              <h2>Your next steps</h2>
              <div className="segmented">
                <button
                  aria-pressed={tasksView === "assigned"}
                  onClick={() => setTasksView("assigned")}
                >
                  Assigned · {data.data.assignedTotal}
                </button>
                <button
                  aria-pressed={tasksView === "due"}
                  onClick={() => setTasksView("due")}
                >
                  Due in 7 days · {data.data.dueTotal}
                </button>
              </div>
            </div>
            {data.data.overdueTotal > 0 && (
              <p className="dashboard-overdue">
                {data.data.overdueTotal} assigned task
                {data.data.overdueTotal === 1 ? " is" : "s are"} overdue.
              </p>
            )}
            {(tasksView === "assigned" ? data.data.assigned : data.data.dueSoon)
              .length ? (
              <DashboardTasks
                items={
                  tasksView === "assigned"
                    ? data.data.assigned
                    : data.data.dueSoon
                }
                today={today}
              />
            ) : (
              <p className="dashboard-empty">
                {tasksView === "assigned"
                  ? "No active tasks assigned to you in this scope."
                  : "No assigned tasks due in the next 7 days."}
              </p>
            )}
            {(tasksView === "assigned"
              ? data.data.assignedTotal
              : data.data.dueTotal) > 8 && (
              <p className="dashboard-footnote">
                Showing the first 8. Open a task’s project to view and filter
                all your tasks.
              </p>
            )}
          </section>
          <section className="home-projects">
            <div className="section-heading">
              <h2>
                Your projects <small>{data.data.projectTotal}</small>
              </h2>
              <div className="home-project-controls">
                <div
                  className="segmented"
                  role="group"
                  aria-label="Project view"
                >
                  <button
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    Grid
                  </button>
                  <button
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    List
                  </button>
                </div>
                <input
                  aria-label="Search projects"
                  placeholder="Search projects…"
                  type="search"
                  maxLength={100}
                  value={filter.q}
                  onChange={(e) => change({ q: e.target.value })}
                />
                <select
                  aria-label="Project status"
                  value={filter.status}
                  onChange={(e) => change({ status: e.target.value })}
                >
                  <option value="active">Active projects</option>
                  <option value="archived">
                    Archived / requested deletion
                  </option>
                </select>
                <select
                  aria-label="Sort projects"
                  value={filter.sort}
                  onChange={(e) => change({ sort: e.target.value })}
                >
                  <option value="updated">Details updated</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
            </div>
            {!data.data.projects.length ? (
              <div className="dashboard-empty">
                <p>
                  {filter.q
                    ? "No matching projects."
                    : filter.status === "archived"
                      ? "No archived projects in this workspace scope."
                      : "No active projects in this workspace scope."}
                </p>
                <button onClick={() => setCreate("project")}>
                  Create a project
                </button>
              </div>
            ) : (
              <div
                className={`home-project-grid${layout === "list" ? " home-project-list" : ""}`}
              >
                {data.data.projects.map((p) => (
                  <Link
                    key={p.id}
                    className="home-project-card"
                    href={projectPath(p)}
                  >
                    <Icon name="folder" />
                    <span>
                      <strong>{p.name}</strong>
                      {(p.archivedAt ||
                        p.deletedAt ||
                        p.workspaceArchivedAt) && (
                        <small>
                          {p.deletedAt ? "Deletion requested" : "Archived"} ·
                          read only
                        </small>
                      )}
                      <small>{p.workspaceName}</small>
                      {p.description && <p>{p.description}</p>}
                      <small>
                        {p.counts.sources}{" "}
                        {p.counts.sources === 1 ? "source" : "sources"} ·{" "}
                        {p.counts.documents} documents · {p.counts.tasks} active
                        tasks
                      </small>
                      <small>Details updated {displayDate(p.updatedAt)}</small>
                    </span>
                    <Icon name="arrow" />
                  </Link>
                ))}
              </div>
            )}
            {data.data.projectTotal > 12 && (
              <nav className="dashboard-pages" aria-label="Project pages">
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
                  {Math.ceil(data.data.projectTotal / 12)}
                </span>
                <button
                  disabled={(filter.page + 1) * 12 >= data.data.projectTotal}
                  onClick={() =>
                    setFilter({ ...filter, page: filter.page + 1 })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </section>
          {projects.length === 0 && (
            <section className="home-first-project">
              <h2>A clear space to begin</h2>
              <p>
                Create a project for your research question. Add a source, write
                a note and plan a next step when you are ready.
              </p>
              <button onClick={() => setCreate("workspace")}>
                Create a shared workspace
              </button>
            </section>
          )}
        </>
      )}
      {create && (
        <CreateDialog
          kind={create}
          workspaces={workspaces}
          onClose={() => setCreate(null)}
          onSaved={(p) => {
            setCreate(null);
            reload();
            refresh();
            if (p) router.push(projectPath(p));
          }}
        />
      )}
      {starting && (
        <Modal title="Start work" onClose={() => setStarting(false)}>
          <p>
            Choose a project, then add a source, write a document or plan your
            next step.
          </p>
          <label>
            Project
            <select
              aria-label="Start in project"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Choose a project…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {!active.length && (
            <button
              onClick={() => {
                setStarting(false);
                setCreate("project");
              }}
            >
              Create a project
            </button>
          )}
          <button
            className="primary"
            disabled={!active.some((p) => p.id === destination)}
            onClick={() => {
              const p = active.find((p) => p.id === destination);
              if (p) {
                setStarting(false);
                router.push(projectPath(p));
              }
            }}
          >
            Open project
          </button>
        </Modal>
      )}
    </div>
  );
}
