"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
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
}: {
  title: string;
  children: (context: {
    me: Me;
    workspaces: Workspace[];
    projects: Project[];
    reload: () => void;
  }) => ReactNode;
}) {
  const me = useResource<Me>("/api/me"),
    workspaces = useResource<Workspace[]>(me.data ? "/api/workspaces" : null),
    projects = useResource<Project[]>(me.data ? "/api/projects" : null);
  const [drawer, setDrawer] = useState(false),
    [create, setCreate] = useState<"project" | "workspace" | null>(null),
    [signOutError, setSignOutError] = useState<unknown>();
  const path = usePathname(),
    reload = () => {
      workspaces.reload();
      projects.reload();
    };
  const current = projects.data?.find((p) => path.startsWith(projectPath(p)));
  async function signOut() {
    try {
      await api("/api/auth/sign-out", {});
      location.assign(location.origin + "/sign-in");
    } catch (error) {
      setSignOutError(error);
    }
  }
  const nav = (
    <>
      <Link href="/home" className="wordmark">
        Atlas <span>Research</span>
      </Link>
      <div className="nav-scroll">
        <button
          className="nav-item"
          onClick={() => {
            setDrawer(false);
            setCreate("project");
          }}
        >
          <Icon name="plus" />
          New project
        </button>
        <Link
          className={`nav-item ${path === "/home" ? "selected" : ""}`}
          href="/home"
          onClick={() => setDrawer(false)}
        >
          <Icon name="home" />
          Home
        </Link>
        <div className="section-label">
          Projects <span>{projects.data?.length ?? 0}</span>
        </div>
        {projects.data?.map((p) => (
          <Link
            key={p.id}
            className={`nav-item ${current?.id === p.id ? "selected" : ""}`}
            href={projectPath(p)}
            onClick={() => setDrawer(false)}
          >
            <Icon name="folder" />
            <span className="truncate">{p.name}</span>
            {p.archivedAt && <small>Archived</small>}
          </Link>
        ))}
        {projects.data?.length === 0 && (
          <p className="nav-hint">Your projects will appear here.</p>
        )}
        {current && (
          <div className="project-subnav">
            <Link
              className={`nav-item ${path.endsWith("/discover") ? "selected" : ""}`}
              href={projectPath(current) + "/discover"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="search" />
              Research
            </Link>
            <Link
              className={`nav-item ${path.includes("/sources") ? "selected" : ""}`}
              href={projectPath(current) + "/sources"}
              onClick={() => setDrawer(false)}
            >
              <Icon name="folder" />
              Library
            </Link>
          </div>
        )}
        <div className="section-label">Workspaces</div>
        {workspaces.data?.map((w) => (
          <Link
            key={w.id}
            className="nav-item"
            href={`/w/${w.id}/settings`}
            onClick={() => setDrawer(false)}
          >
            <span className="workspace-mark">
              {w.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{w.name}</span>
          </Link>
        ))}
        <button
          className="nav-item"
          onClick={() => {
            setDrawer(false);
            setCreate("workspace");
          }}
        >
          <Icon name="plus" />
          Shared workspace
        </button>
      </div>
      <div className="account">
        <Link
          href="/settings"
          className="nav-item"
          onClick={() => setDrawer(false)}
        >
          <span className="avatar">
            {me.data?.user.name.slice(0, 1).toUpperCase() ?? "A"}
          </span>
          <span className="truncate">{me.data?.user.name ?? "Account"}</span>
          <Icon name="settings" />
        </Link>
        <div className="actions">
          <ThemeControl />
          <button onClick={signOut}>Sign out</button>
        </div>
        <InlineError error={signOutError} />
      </div>
    </>
  );
  const error = me.error ?? workspaces.error ?? projects.error;
  return (
    <div className="app-shell">
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
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <Link href="/home" className="top-context">
            {current?.name ?? "Atlas"}
          </Link>
          <span className="top-divider" />
          <span className="top-tab">{title}</span>
          <span className="private-label">Private workspace</span>
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
            })
          )}
        </main>
      </div>
      {drawer && (
        <Modal drawer title="Navigation" onClose={() => setDrawer(false)}>
          <nav className="drawer-nav">{nav}</nav>
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
    [workspace, setWorkspace] = useState("all");
  return (
    <WorkspaceShell title={onboarding ? "Welcome" : "Home"}>
      {({ me, workspaces, projects, reload }) => (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">Your research workspace</div>
              <h1>
                {onboarding
                  ? "Welcome to Atlas"
                  : `Hello, ${me.user.name.split(" ")[0]}`}
              </h1>
              <p>
                {projects.length
                  ? "Pick up a question, or start something new."
                  : "Every good project starts with a question."}
              </p>
            </div>
            <button className="primary" onClick={() => setCreate("project")}>
              <Icon name="plus" />
              New project
            </button>
          </div>
          <div className="home-toolbar">
            <label>
              Workspace
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
              >
                <option value="all">All workspaces</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <span>Only projects you belong to</span>
          </div>
          <div className="section-heading">
            <h2>
              Projects{" "}
              <span className="count">
                {
                  projects.filter(
                    (p) => workspace === "all" || p.workspaceId === workspace,
                  ).length
                }
              </span>
            </h2>
          </div>
          <div className="project-grid">
            <button
              className="new-project-card"
              onClick={() => setCreate("project")}
            >
              <Icon name="plus" />
              <span>Create a project</span>
            </button>
            {projects
              .filter((p) => workspace === "all" || p.workspaceId === workspace)
              .map((p) => (
                <Link href={projectPath(p)} className="project-card" key={p.id}>
                  <div className="project-preview">
                    <Icon name="folder" />
                    <p>
                      {p.description || "A place for your research question."}
                    </p>
                  </div>
                  <strong>{p.name}</strong>
                  <div className="card-meta">
                    <span>
                      {workspaces.find((w) => w.id === p.workspaceId)?.name}
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
          {projects.length === 0 && (
            <section className="getting-started">
              <Icon name="folder" />
              <h2>A clear space to begin</h2>
              <p>
                Create your first private project in your personal workspace, or
                create a shared workspace to invite collaborators.
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
        </>
      )}
    </WorkspaceShell>
  );
}
