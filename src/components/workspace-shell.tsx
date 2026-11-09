"use client";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { ResearchLibrary } from "@/lib/research-types";
import {
  Failure,
  Icon,
  InlineError,
  Loading,
  Modal,
  ThemeControl,
  useResource,
} from "./ui";
export type Workspace = {
  id: string;
  name: string;
  kind: string;
  archivedAt: string | null;
};
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};
export type Me = {
  user: { id: string; name: string; email: string };
  personalWorkspace: Workspace;
};
export const projectPath = (p: Pick<Project, "workspaceId" | "id">) =>
  `/w/${p.workspaceId}/p/${p.id}`;

export function WorkspaceShell({
  title,
  children,
  surface,
}: {
  title: string;
  surface?: string;
  children: (context: {
    me: Me;
    workspaces: Workspace[];
    projects: Project[];
    reload: () => void;
    recentSources?: ResearchLibrary;
    contextProject?: Project;
  }) => ReactNode;
}) {
  const me = useResource<Me>("/api/me"),
    workspaces = useResource<Workspace[]>(me.data ? "/api/workspaces" : null),
    projects = useResource<Project[]>(me.data ? "/api/projects" : null);
  const [drawer, setDrawer] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [switching, setSwitching] = useState(false),
    [create, setCreate] = useState<"project" | "workspace" | null>(null),
    [signOutError, setSignOutError] = useState<unknown>();
  const path = usePathname(),
    current = projects.data?.find((p) => path.startsWith(projectPath(p))),
    contextProject =
      current ?? projects.data?.find((p) => !p.archivedAt && !p.deletedAt),
    base = contextProject ? projectPath(contextProject) : null;
  const sources = useResource<ResearchLibrary>(
    contextProject
      ? `/api/research/${contextProject.workspaceId}/${contextProject.id}/sources`
      : null,
  );
  const reload = () => {
    workspaces.reload();
    projects.reload();
    sources.reload();
  };
  async function signOut() {
    try {
      if (
        !window.dispatchEvent(
          new Event("atlas-before-signout", { cancelable: true }),
        )
      ) {
        setSignOutError(new ApiError(409, "UNSAVED_CHANGES"));
        return;
      }
      await api("/api/auth/sign-out", {});
      try {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith("atlas-draft-v1:")) sessionStorage.removeItem(key);
      } catch {}
      location.assign(location.origin + "/sign-in");
    } catch (error) {
      setSignOutError(error);
    }
  }
  const router = useRouter();
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k" && base) {
        event.preventDefault();
        const input = document.getElementById("library-search");
        if (input) input.focus();
        else router.push(base + "/sources#library-search");
      }
      if (event.key === "\\") {
        event.preventDefault();
        if (innerWidth >= 900) setCollapsed((v) => !v);
        else setDrawer((v) => !v);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [base, router]);
  const active =
    path === "/inbox"
      ? "inbox"
      : path.includes("/docs")
        ? "documents"
        : path.includes("/tasks")
          ? "tasks"
          : path.includes("/discussions")
            ? "discussions"
            : path.endsWith("/discover")
              ? "discover"
              : path.includes("/sources")
                ? "library"
                : path.endsWith("/members")
                  ? "members"
                  : current
                    ? "overview"
                    : path === "/home" || path === "/onboarding"
                      ? "home"
                      : "settings";
  const nav = (
    <>
      <div className="sidebar-heading">
        <button
          className="project-switcher"
          onClick={() => {
            setDrawer(false);
            setSwitching(true);
          }}
        >
          <span className="truncate">{contextProject?.name ?? "Atlas"}</span>
          <Icon name="chevron" />
        </button>
        <button
          className="icon-button sidebar-collapse"
          aria-label="Close sidebar"
          onClick={() => {
            setDrawer(false);
            if (innerWidth >= 900) setCollapsed(true);
          }}
        >
          <Icon name="menu" />
        </button>
      </div>
      <div className="nav-scroll">
        <button
          className="nav-item"
          aria-label="New project"
          onClick={() => {
            setDrawer(false);
            setCreate("project");
          }}
        >
          <Icon name="new" />
          <span>New</span>
        </button>
        {base && (
          <Link
            className="nav-item"
            href={base + "/sources#library-search"}
            onClick={() => setDrawer(false)}
          >
            <Icon name="search" />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </Link>
        )}
        <Link
          className={`nav-item ${path === "/home" ? "selected" : ""}`}
          href="/home"
          onClick={() => setDrawer(false)}
        >
          <Icon name="home" />
          Home
        </Link>
        <Link
          className={`nav-item ${active === "inbox" ? "selected" : ""}`}
          href="/inbox"
          onClick={() => setDrawer(false)}
        >
          <Icon name="inbox" />
          Inbox
        </Link>
        {base && (
          <details className="nav-group" open>
            <summary>
              <Icon name="chevron" />
              Project
            </summary>
            <Link
              className={`nav-item ${active === "overview" ? "selected" : ""}`}
              href={base}
              onClick={() => setDrawer(false)}
            >
              <Icon name="grid" />
              Overview
            </Link>
            <Link
              className={`nav-item ${active === "members" ? "selected" : ""}`}
              href={base + "/members"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="people" />
              Members
            </Link>
            <Link
              className={`nav-item ${active === "tasks" ? "selected" : ""}`}
              href={base + "/tasks"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="check" />
              Tasks
            </Link>
            <Link
              className={`nav-item ${active === "documents" ? "selected" : ""}`}
              href={base + "/docs"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="note" />
              Documents
            </Link>
            <Link
              className={`nav-item ${active === "discussions" ? "selected" : ""}`}
              href={base + "/discussions"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="discussion" />
              Discussions
            </Link>
          </details>
        )}
        {base && (
          <details className="nav-group" open>
            <summary>
              <Icon name="chevron" />
              Sources
              {sources.data && (
                <span className="nav-count">
                  {sources.data.items.length}
                  {sources.data.hasMore ? "+" : ""}
                </span>
              )}
            </summary>
            {sources.data?.items.slice(0, 5).map((source) => (
              <Link
                key={source.id}
                className={`nav-item source-nav ${path.includes(source.id) ? "selected" : ""}`}
                title={source.title}
                href={base + "/sources/" + source.id}
                onClick={() => setDrawer(false)}
              >
                <Icon name="file" />
                <span className="truncate">{source.title}</span>
              </Link>
            ))}
            <Link
              className={`nav-item nav-secondary ${active === "library" && !path.match(/sources\//) ? "selected" : ""}`}
              href={base + "/sources"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="library" />
              Library
            </Link>
            <Link
              className={`nav-item nav-secondary ${active === "discover" ? "selected" : ""}`}
              href={base + "/discover"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="telescope" />
              Find new papers
            </Link>
          </details>
        )}
        {!base && (
          <div className="nav-hint">
            Create a project to start your library.
          </div>
        )}
      </div>
      <div className="account">
        <details className="account-menu">
          <summary>
            <span className="avatar">
              {me.data?.user.name.slice(0, 2).toUpperCase() ?? "A"}
            </span>
            <span className="truncate">{me.data?.user.name ?? "Account"}</span>
            <Icon name="chevron" />
          </summary>
          <div className="account-popover">
            <Link href="/settings">
              <Icon name="settings" />
              Settings
            </Link>
            {workspaces.data?.map((w) => (
              <Link key={w.id} href={`/w/${w.id}/settings`}>
                <Icon name="folder" />
                {w.name}
              </Link>
            ))}
            <button
              onClick={() => {
                setDrawer(false);
                setCreate("workspace");
              }}
            >
              <Icon name="plus" />
              Shared workspace
            </button>
            <button onClick={signOut}>
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </details>
        <ThemeControl compact />
        <InlineError error={signOutError} />
      </div>
    </>
  );
  const error = me.error ?? workspaces.error ?? projects.error;
  return (
    <div
      className={`app-shell ${surface ? `surface-${surface}` : ""} ${collapsed ? "sidebar-closed" : ""}`}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        {nav}
      </aside>
      <div className="main-pane">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => {
              if (innerWidth >= 900) setCollapsed(false);
              else setDrawer(true);
            }}
          >
            <Icon name="menu" />
          </button>
          <nav className="workspace-tabs" aria-label="Open pages">
            <Link
              href="/home"
              aria-current={active === "home" ? "page" : undefined}
            >
              <Icon name="home" />
              <span>Home</span>
            </Link>
            {!current && ["settings", "inbox"].includes(active) && (
              <Link href={path} aria-current="page">
                <Icon name="settings" />
                <span>{title}</span>
              </Link>
            )}
            {current && (
              <>
                {[
                  "overview",
                  "members",
                  "documents",
                  "tasks",
                  "discussions",
                ].includes(active) ? (
                  <Link
                    href={
                      projectPath(current) +
                      (active === "members"
                        ? "/members"
                        : active === "documents"
                          ? "/docs"
                          : active === "tasks"
                            ? "/tasks"
                            : active === "discussions"
                              ? "/discussions"
                              : "")
                    }
                    aria-current="page"
                  >
                    <Icon
                      name={
                        active === "members"
                          ? "people"
                          : active === "documents"
                            ? "note"
                            : active === "tasks"
                              ? "check"
                              : active === "discussions"
                                ? "discussion"
                                : "grid"
                      }
                    />
                    <span>{title}</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      href={projectPath(current) + "/sources"}
                      aria-current={
                        active === "library" && surface !== "reader"
                          ? "page"
                          : undefined
                      }
                    >
                      <Icon name="library" />
                      <span>Library</span>
                    </Link>
                    {(active === "discover" || surface === "reader") && (
                      <>
                        <Link
                          href={projectPath(current) + "/discover"}
                          aria-current={
                            active === "discover" ? "page" : undefined
                          }
                        >
                          <Icon name="telescope" />
                          <span>Research</span>
                        </Link>
                      </>
                    )}
                    {surface === "reader" && (
                      <span className="open-file-tab" aria-current="page">
                        <Icon name="file" />
                        <span className="truncate" title={title}>
                          {title}
                        </span>
                        <Link
                          href={projectPath(current) + "/sources"}
                          aria-label="Close reader"
                        >
                          <Icon name="close" />
                        </Link>
                      </span>
                    )}
                  </>
                )}
              </>
            )}
          </nav>
          <button
            className="icon-button toolbar-new"
            aria-label="New project"
            onClick={() => setCreate("project")}
          >
            <Icon name="plus" />
          </button>
          <div id="atlas-toolbar-actions" className="toolbar-actions" />
        </header>
        <main id="main" tabIndex={-1} className="content">
          {error ? (
            <Failure
              error={error}
              retry={() => {
                me.reload();
                reload();
              }}
            />
          ) : !me.data || !workspaces.data || !projects.data ? (
            <Loading />
          ) : (
            children({
              me: me.data,
              workspaces: workspaces.data,
              projects: projects.data,
              reload,
              recentSources: sources.data,
              contextProject,
            })
          )}
        </main>
      </div>
      {drawer && (
        <Modal drawer title="Navigation" onClose={() => setDrawer(false)}>
          <nav className="drawer-nav">{nav}</nav>
        </Modal>
      )}
      {switching && (
        <Modal title="Switch project" onClose={() => setSwitching(false)}>
          <div className="project-picker">
            {projects.data?.map((p) => (
              <Link
                key={p.id}
                href={projectPath(p)}
                onClick={() => setSwitching(false)}
              >
                <Icon name="folder" />
                <span>
                  {p.name}
                  <small>
                    {workspaces.data?.find((w) => w.id === p.workspaceId)?.name}
                  </small>
                </span>
                {current?.id === p.id && <Icon name="check" />}
              </Link>
            ))}
            <button
              onClick={() => {
                setSwitching(false);
                setCreate("project");
              }}
            >
              <Icon name="plus" />
              New project
            </button>
            <button
              onClick={() => {
                setSwitching(false);
                setCreate("workspace");
              }}
            >
              <Icon name="plus" />
              Shared workspace
            </button>
          </div>
        </Modal>
      )}
      {create && workspaces.data && (
        <CreateDialog
          kind={create}
          workspaces={workspaces.data}
          onClose={() => setCreate(null)}
          onSaved={() => {
            reload();
            setCreate(null);
          }}
        />
      )}
    </div>
  );
}
export function CreateDialog({
  kind,
  workspaces,
  onClose,
  onSaved,
}: {
  kind: "project" | "workspace";
  workspaces: Workspace[];
  onClose: () => void;
  onSaved: (project?: Project) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [requestId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<Project>(
        kind === "project" ? "/api/projects" : "/api/workspaces",
        {
          name: String(data.get("name")),
          requestId,
          ...(kind === "project"
            ? {
                workspaceId: String(data.get("workspaceId")),
                description: String(data.get("description")),
              }
            : {}),
        },
      );
      onSaved(kind === "project" ? result : undefined);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={kind === "project" ? "New project" : "New shared workspace"}
      onClose={onClose}
    >
      <p>
        {kind === "project"
          ? "A private space for a research question. Only invited project members can open it."
          : "Bring a small team together. Each project has its own members."}
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        <label>
          Name
          <input
            name="name"
            required
            maxLength={kind === "project" ? 100 : 80}
            autoFocus
          />
        </label>
        {kind === "project" && (
          <>
            <label>
              Workspace
              <select name="workspaceId" aria-label="Workspace">
                {workspaces
                  .filter((w) => !w.archivedAt)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {w.kind}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Description <span className="optional">optional</span>
              <textarea name="description" rows={3} maxLength={500} />
            </label>
          </>
        )}
        <InlineError error={error} />
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Creating…"
              : kind === "project"
                ? "Create project"
                : "Create workspace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Home({ onboarding = false }: { onboarding?: boolean }) {
  const [create, setCreate] = useState<"project" | "workspace" | null>(null),
    [workspace, setWorkspace] = useState("all"),
    [kind, setKind] = useState("all"),
    [view, setView] = useState("grid"),
    [sort, setSort] = useState("edited");
  return (
    <WorkspaceShell title={onboarding ? "Welcome" : "Home"}>
      {({
        me,
        workspaces,
        projects,
        reload,
        recentSources,
        contextProject,
      }) => {
        const hour = new Date().getHours(),
          greeting =
            hour < 12
              ? "Good morning"
              : hour < 18
                ? "Good afternoon"
                : "Good evening";
        const visible = projects
          .filter(
            (p) =>
              (workspace === "all" || p.workspaceId === workspace) &&
              (kind === "all" ||
                workspaces.find((w) => w.id === p.workspaceId)?.kind ===
                  (kind === "personal" ? "personal" : "shared")),
          )
          .sort((a, b) =>
            sort === "name"
              ? a.name.localeCompare(b.name)
              : new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
          );
        return (
          <div className="home-surface">
            <h1>
              {onboarding
                ? "Welcome to Atlas"
                : `${greeting}, ${me.user.name.split(" ")[0]}`}
            </h1>
            <div className="home-viewbar">
              <div
                className="segmented"
                role="group"
                aria-label="Project scope"
              >
                {[
                  ["all", "All"],
                  ["personal", "Personal"],
                  ["shared", "Shared"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={kind === key}
                    onClick={() => setKind(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {workspaces.length > 1 && (
                <label className="workspace-filter">
                  <span className="sr-only">Workspace</span>
                  <select
                    aria-label="Workspace"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                  >
                    <option value="all">All workspaces</option>
                    {workspaces.map((w) => (
                      <option value={w.id} key={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="home-view-options">
                <label>
                  Sort
                  <select
                    aria-label="Sort projects"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="edited">Last edited</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </label>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Project view"
                >
                  <button
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <Icon name="grid" />
                    Grid
                  </button>
                  <button
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <Icon name="list" />
                    List
                  </button>
                </div>
              </div>
            </div>
            {contextProject && !!recentSources?.items.length && (
              <section className="continue-section">
                <h2>Continue working</h2>
                <div className="continue-grid">
                  {recentSources.items.slice(0, 4).map((source) => (
                    <Link
                      href={
                        projectPath(contextProject) + "/sources/" + source.id
                      }
                      key={source.id}
                    >
                      <span className="continue-icon">
                        <Icon name="book" />
                      </span>
                      <span className="truncate">
                        <strong>{source.title}</strong>
                        <small>
                          {recentSources.readings.find(
                            (r) => r.sourceId === source.id,
                          )?.status === "reading"
                            ? "Reading"
                            : "Source"}{" "}
                          · {contextProject.name}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section>
              <div className="section-heading">
                <h2>
                  Projects <span className="count">{visible.length}</span>
                </h2>
              </div>
              <div
                className={view === "grid" ? "project-grid" : "project-list"}
              >
                <button
                  className="new-project-card"
                  aria-label="Create a project"
                  onClick={() => setCreate("project")}
                >
                  <Icon name="plus" />
                </button>
                {visible.map((p) => (
                  <Link
                    href={projectPath(p)}
                    className="project-card"
                    key={p.id}
                  >
                    <div className="project-preview">
                      <small>
                        {workspaces.find((w) => w.id === p.workspaceId)?.name}
                      </small>
                      <p>
                        {p.description || "Start with a research question."}
                      </p>
                    </div>
                    <strong>{p.name}</strong>
                    <div className="card-meta">
                      <span>
                        Edited{" "}
                        {new Date(p.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span>
                        {p.deletedAt
                          ? "Deletion requested"
                          : p.archivedAt
                            ? "Archived"
                            : "Private"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
            {projects.length === 0 && (
              <section className="getting-started">
                <h2>A clear space to begin</h2>
                <p>
                  Create your first private project, or start a shared workspace
                  with your team.
                </p>
                <button onClick={() => setCreate("workspace")}>
                  Create a shared workspace
                  <Icon name="arrow" />
                </button>
              </section>
            )}
            {create && (
              <CreateDialog
                kind={create}
                workspaces={workspaces}
                onClose={() => setCreate(null)}
                onSaved={(p) => {
                  setCreate(null);
                  reload();
                  if (p) location.assign(projectPath(p));
                }}
              />
            )}
          </div>
        );
      }}
    </WorkspaceShell>
  );
}
