"use client";
import { HomeExperience } from "./home-experience";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorkingTabs } from "./working-tabs";
import { useWorkspaceIdentity } from "./workspace-context";
import { api, ApiError } from "@/lib/api";
import type { ResearchLibrary } from "@/lib/research-types";
import {
  Failure,
  Icon,
  InlineError,
  Loading,
  Modal,
  PopoverMenu,
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
  const {
    me,
    workspaces,
    projects,
    inbox,
    collapsed,
    setCollapsed,
    selectedProject,
    openSearch,
  } = useWorkspaceIdentity();
  const [drawer, setDrawer] = useState(false),
    [switching, setSwitching] = useState(false),
    [projectQuery, setProjectQuery] = useState(""),
    [create, setCreate] = useState<"project" | "workspace" | null>(null),
    [signOutError, setSignOutError] = useState<unknown>();
  const path = usePathname(),
    current = projects.data?.find((p) => path.startsWith(projectPath(p))),
    contextProject = current ?? selectedProject,
    base = contextProject ? projectPath(contextProject) : null;
  useEffect(() => {
    const close = () => {
      setSwitching(false);
      setDrawer(false);
    };
    window.addEventListener("atlas-navigation-start", close);
    return () => window.removeEventListener("atlas-navigation-start", close);
  }, []);
  const sources = useResource<ResearchLibrary>(
    contextProject
      ? `/api/research/${contextProject.workspaceId}/${contextProject.id}/sources`
      : null,
  );
  useEffect(() => {
    const refresh = sources.reload;
    window.addEventListener("atlas-research-changed", refresh);
    return () => window.removeEventListener("atlas-research-changed", refresh);
  }, [sources.reload]);
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
      window.dispatchEvent(new Event("atlas-signed-out"));
      try {
        for (const key of Object.keys(sessionStorage))
          if (
            key.startsWith("atlas-draft-v1:") ||
            key.startsWith("atlas-ai-") ||
            key.startsWith("atlas-navigation:") ||
            key.startsWith("atlas-project:") ||
            key.startsWith("atlas-reply:")
          )
            sessionStorage.removeItem(key);
      } catch {}
      location.assign(location.origin + "/sign-in");
    } catch (error) {
      setSignOutError(error);
    }
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "\\") {
        event.preventDefault();
        if (innerWidth >= 900) setCollapsed((v) => !v);
        else setDrawer((v) => !v);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setCollapsed]);
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
              ? "library"
              : path.includes("/sources")
                ? "library"
                : path.endsWith("/members")
                  ? "members"
                  : path.endsWith("/settings")
                    ? "settings"
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
          <span className="scope-heading">
            <strong>{current?.name ?? "Personal area"}</strong>
            <small>
              {current
                ? workspaces.data?.find((w) => w.id === current.workspaceId)
                    ?.name
                : "Home · Inbox · Switch project"}
            </small>
          </span>
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
        <button
          className="nav-item"
          onClick={() => {
            setDrawer(false);
            openSearch();
          }}
        >
          <Icon name="search" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <span className="nav-scope-label">Personal</span>
        <Link
          className={`nav-item ${active === "home" ? "selected" : ""}`}
          href="/home"
          aria-current={active === "home" ? "page" : undefined}
          onClick={() => setDrawer(false)}
        >
          <Icon name="home" />
          Home
        </Link>
        <Link
          className={`nav-item ${active === "inbox" ? "selected" : ""}`}
          href="/inbox"
          aria-current={active === "inbox" ? "page" : undefined}
          onClick={() => setDrawer(false)}
        >
          <Icon name="inbox" />
          Inbox
          {!!inbox.data?.unread && (
            <span className="nav-count">{inbox.data.unread}</span>
          )}
        </Link>
        {base && (
          <details className="nav-group" open>
            <summary>
              <Icon name="chevron" />
              Project
            </summary>
            <div className="nav-project-context">
              <strong>{contextProject?.name}</strong>
              <small>
                {
                  workspaces.data?.find(
                    (w) => w.id === contextProject?.workspaceId,
                  )?.name
                }
              </small>
            </div>
            <Link
              className={`nav-item ${active === "overview" ? "selected" : ""}`}
              aria-current={active === "overview" ? "page" : undefined}
              href={base}
              onClick={() => setDrawer(false)}
            >
              <Icon name="grid" />
              Overview
            </Link>
            <Link
              className={`nav-item ${active === "library" ? "selected" : ""}`}
              href={base + "/sources"}
              onClick={() => setDrawer(false)}
              aria-current={active === "library" ? "page" : undefined}
            >
              <Icon name="library" />
              Library
            </Link>
            <Link
              className={`nav-item ${active === "documents" ? "selected" : ""}`}
              aria-current={active === "documents" ? "page" : undefined}
              href={base + "/docs"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="note" />
              Documents
            </Link>
            <Link
              className={`nav-item ${active === "tasks" ? "selected" : ""}`}
              aria-current={active === "tasks" ? "page" : undefined}
              href={base + "/tasks"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="check" />
              Tasks
            </Link>
            <Link
              className={`nav-item ${active === "discussions" ? "selected" : ""}`}
              aria-current={active === "discussions" ? "page" : undefined}
              href={base + "/discussions"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="discussion" />
              Discussions
            </Link>
          </details>
        )}
        {!base && !!projects.data && (
          <div className="nav-hint">
            {projects.data.length
              ? "Choose a project to open its research."
              : "Create a project to start your library."}
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
            <Link href="/help">
              <Icon name="book" />
              Pilot guide & support
            </Link>
            <Link href="/settings">
              <Icon name="settings" />
              Account settings
            </Link>
            {base && (
              <Link href={base + "/settings"}>
                <Icon name="folder" />
                Project settings
              </Link>
            )}
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
          <WorkingTabs
            userId={projects.data ? me.data?.user.id : undefined}
            path={path}
            title={title}
            allowedProjects={projects.data?.map(projectPath) ?? []}
            projectBase={base}
          />
          <PopoverMenu className="action-menu">
            <summary className="icon-button toolbar-new" aria-label="Open page">
              <Icon name="plus" />
            </summary>
            <div className="open-page-menu">
              <Link href="/home">Home</Link>
              <Link href="/inbox">Inbox</Link>
              {base && (
                <>
                  <Link href={base}>Overview</Link>
                  <Link href={base + "/sources"}>Library</Link>
                  <Link href={base + "/docs"}>Documents</Link>
                  <Link href={base + "/tasks"}>Tasks</Link>
                  <Link href={base + "/discussions"}>Discussions</Link>
                </>
              )}
              <button onClick={() => setSwitching(true)}>
                Switch project…
              </button>
            </div>
          </PopoverMenu>
          <div id="atlas-toolbar-actions" className="toolbar-actions" />
          {contextProject && <div id="atlas-ai-toggle" />}
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
          <label className="picker-search">
            <Icon name="search" />
            <input
              aria-label="Search projects"
              placeholder="Find a project or workspace…"
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
            />
          </label>
          <div className="project-picker">
            {projects.data
              ?.filter(
                (p) =>
                  !p.deletedAt &&
                  `${p.name} ${workspaces.data?.find((w) => w.id === p.workspaceId)?.name ?? ""}`
                    .toLowerCase()
                    .includes(projectQuery.toLowerCase()),
              )
              .map((p) => (
                <Link
                  key={p.id}
                  href={projectPath(p)}
                  onClick={() => setSwitching(false)}
                >
                  <Icon name="folder" />
                  <span>
                    {p.name}
                    <small>
                      {
                        workspaces.data?.find((w) => w.id === p.workspaceId)
                          ?.name
                      }
                      {p.archivedAt ? " · Archived" : ""}
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
  return <HomeExperience onboarding={onboarding} />;
}
