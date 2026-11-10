"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Failure, InlineError, Loading, Modal, useResource } from "./ui";
import {
  WorkspaceShell,
  type Me,
  type Workspace,
  type Project,
  projectPath,
} from "./workspace-shell";
import {
  AppearanceSettings,
  NotificationSettings,
} from "./account-preferences";
import type { Member } from "./project-screen";
type Session = {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
export function SettingsScreen({ workspaceId }: { workspaceId?: string }) {
  return (
    <WorkspaceShell
      title={workspaceId ? "Workspace settings" : "Account settings"}
      surface="settings"
    >
      {({ me, workspaces, projects, reload }) =>
        workspaceId ? (
          <WorkspaceSettings
            key={workspaceId}
            workspace={workspaces.find((w) => w.id === workspaceId)}
            userId={me.user.id}
            projects={projects.filter((p) => p.workspaceId === workspaceId)}
            reload={reload}
          />
        ) : (
          <AccountSettings
            key={me.user.id}
            me={me}
            reload={reload}
            workspaces={workspaces}
          />
        )
      }
    </WorkspaceShell>
  );
}
function AccountSettings({
  me,
  reload,
  workspaces,
}: {
  me: Me;
  reload: () => void;
  workspaces: Workspace[];
}) {
  const requested = useSearchParams().get("tab"),
    tab = [
      "profile",
      "appearance",
      "notifications",
      "security",
      "workspaces",
    ].includes(requested ?? "")
      ? requested
      : "profile";
  return (
    <div className="settings-layout">
      <nav aria-label="Account settings sections">
        <small>Account settings</small>
        {(
          [
            ["profile", "Profile"],
            ["appearance", "Appearance"],
            ["notifications", "Notifications"],
            ["security", "Security & sessions"],
            ["workspaces", "Workspaces"],
          ] as const
        ).map(([key, title]) => (
          <Link
            aria-current={tab === key ? "page" : undefined}
            key={key}
            href={"/settings?tab=" + key}
          >
            {title}
          </Link>
        ))}
      </nav>
      <section className="settings-body" aria-label="Account settings content">
        <header>
          <small>Personal account</small>
          <h1>Account settings</h1>
        </header>
        {tab === "profile" ? (
          <Profile me={me} reload={reload} />
        ) : tab === "appearance" ? (
          <AppearanceSettings />
        ) : tab === "notifications" ? (
          <NotificationSettings />
        ) : tab === "security" ? (
          <SecuritySessions />
        ) : (
          <section className="settings-section">
            <h2>Workspaces</h2>
            <p>
              Workspace membership and project access are managed separately.
            </p>
            <div className="settings-link-list">
              {workspaces.map((w) => (
                <Link href={`/w/${w.id}/settings`} key={w.id}>
                  <strong>{w.name}</strong>
                  <small>
                    {w.kind} workspace{w.archivedAt ? " · Archived" : ""}
                  </small>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
function Profile({ me, reload }: { me: Me; reload: () => void }) {
  const [name, setName] = useState(me.user.name),
    [saved, setSaved] = useState(me.user.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      const result = await api<{ user: { name: string } }>(
        "/api/me",
        { name },
        "PATCH",
      );
      setName(result.user.name);
      setSaved(result.user.name);
      reload();
      setNotice("Profile saved.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>Profile</h2>
      <form onSubmit={save}>
        <label>
          Name
          <input
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNotice("");
            }}
            required
            maxLength={80}
          />
        </label>
        <div className="settings-readonly">
          <span>Sign-in email</span>
          <strong>{me.user.email}</strong>
          <small>
            Your verified sign-in address. Credential changes are separate from
            profile editing.
          </small>
        </div>
        <InlineError error={error} />
        <div className="settings-save-row">
          <button
            className="primary"
            disabled={busy || (!error && name.trim() === saved)}
          >
            {busy ? "Saving…" : error ? "Retry save profile" : "Save profile"}
          </button>
          <small>
            {name.trim() !== saved ? "Unsaved changes" : "Up to date"}
          </small>
        </div>
        <p role="status">{notice}</p>
      </form>
    </section>
  );
}
function SecuritySessions() {
  const sessions = useResource<{ sessions: Session[] }>("/api/me/sessions"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  async function revoke(id: string, current: boolean) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/me/sessions", { sessionId: id });
      if (current) location.assign(location.origin + "/sign-in");
      else {
        sessions.reload();
        setNotice("Session revoked.");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>Security & sessions</h2>
      <p>
        Signing out a session removes that device’s access immediately. This is
        separate from your public profile.
      </p>
      <InlineError error={error} />
      {sessions.error ? (
        sessions.error instanceof ApiError &&
        sessions.error.code === "REAUTH_REQUIRED" ? (
          <p className="notice">
            To manage signed-in devices,{" "}
            <Link href="/sign-in?next=%2Fsettings%3Ftab%3Dsecurity">
              sign in again
            </Link>
            . Your research stays saved.
          </p>
        ) : (
          <Failure error={sessions.error} retry={sessions.reload} />
        )
      ) : !sessions.data ? (
        <Loading />
      ) : (
        <ul className="member-list">
          {sessions.data.sessions.map((s) => (
            <li key={s.id}>
              <div className="member-info">
                <strong>
                  {s.current ? "This session" : "Another session"}
                </strong>
                <span>
                  Started{" "}
                  {new Date(s.createdAt).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · Expires{" "}
                  {new Date(s.expiresAt).toLocaleDateString("en-GB", {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
              <button
                disabled={busy}
                onClick={() => void revoke(s.id, s.current)}
              >
                Revoke session
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
function WorkspaceSettings({
  workspace,
  userId,
  projects,
  reload,
}: {
  workspace: Workspace | undefined;
  userId: string;
  projects: Project[];
  reload: () => void;
}) {
  const detail = useResource<{ workspace: Workspace; role: string }>(
      workspace ? `/api/workspaces/${workspace.id}` : null,
    ),
    manage = !!detail.data && ["owner", "admin"].includes(detail.data.role),
    members = useResource<Member[]>(
      workspace && manage ? `/api/workspaces/${workspace.id}/members` : null,
    );
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [transfer, setTransfer] = useState(false),
    [notice, setNotice] = useState("");
  if (!workspace) return <Failure error={null} retry={reload} />;
  async function mutate(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await api(`/api/workspaces/${workspace!.id}`, body, "PATCH");
      members.reload();
      detail.reload();
      reload();
      setTransfer(false);
      setNotice("Workspace updated.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const role = detail.data?.role;
  return (
    <div className="settings-content settings-scope">
      <Link href="/settings?tab=workspaces">← Account workspaces</Link>
      <header>
        <small>{workspace.kind} workspace</small>
        <h1>{workspace.name}</h1>
        <p>Workspace membership does not grant access to private projects.</p>
      </header>
      {detail.error ? (
        <Failure error={detail.error} retry={detail.reload} />
      ) : !detail.data ? (
        <Loading />
      ) : (
        <>
          <InlineError error={error} />
          <p role="status">{notice}</p>
          <section className="settings-section">
            <h2>Workspace details</h2>
            {manage ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({
                    action: "update",
                    name: String(new FormData(e.currentTarget).get("name")),
                  });
                }}
              >
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={workspace.name}
                    required
                    maxLength={80}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save workspace"}
                </button>
              </form>
            ) : (
              <p>
                You are a workspace member. Owners and admins manage workspace
                details and membership.
              </p>
            )}
          </section>
          <section className="settings-section">
            <h2>Project settings</h2>
            <p>
              Open a project to manage its research purpose and project access.
            </p>
            <div className="settings-link-list">
              {projects.map((p) => (
                <Link href={projectPath(p) + "/settings"} key={p.id}>
                  <strong>{p.name}</strong>
                  <small>
                    {p.archivedAt || p.deletedAt
                      ? "Read only"
                      : "Project settings"}
                  </small>
                </Link>
              ))}
            </div>
            {!projects.length && (
              <p>No projects are available to you in this workspace.</p>
            )}
          </section>
          {manage && (
            <section className="settings-section">
              <h2>Workspace members</h2>
              <p>
                New collaborators join through a shared project invitation.
                Project owners manage invitations and research access in each
                project.
              </p>
              {members.error ? (
                <Failure error={members.error} retry={members.reload} />
              ) : !members.data ? (
                <Loading />
              ) : (
                <ul className="member-list">
                  {members.data.map((m) => (
                    <li key={m.userId}>
                      <div className="member-info">
                        <strong>
                          {m.name}
                          {m.userId === userId ? " (you)" : ""}
                        </strong>
                        <span>{m.email}</span>
                      </div>
                      <span className="badge">{m.role}</span>
                      {workspace.kind === "shared" &&
                        m.userId !== userId &&
                        m.role !== "owner" &&
                        (role === "owner" || m.role === "member") && (
                          <div className="member-actions">
                            {role === "owner" && (
                              <select
                                aria-label={`Workspace role for ${m.email}`}
                                value={m.role}
                                disabled={busy}
                                onChange={(e) =>
                                  void mutate({
                                    action: "role",
                                    userId: m.userId,
                                    role: e.target.value,
                                  })
                                }
                              >
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                              </select>
                            )}
                            <button
                              disabled={busy}
                              onClick={() =>
                                void mutate({
                                  action: "revoke",
                                  userId: m.userId,
                                })
                              }
                            >
                              Remove from workspace
                            </button>
                          </div>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {manage && (
            <section className="settings-section settings-administration">
              <h2>Workspace administration</h2>
              <p>
                Archiving makes all workspace projects read only. Role and
                ownership changes affect access.
              </p>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      action: "update",
                      archived: !workspace.archivedAt,
                    })
                  }
                >
                  {workspace.archivedAt
                    ? "Restore workspace"
                    : "Archive workspace"}
                </button>
                {workspace.kind === "shared" &&
                  role === "owner" &&
                  members.data?.some((m) => m.userId !== userId) && (
                    <button onClick={() => setTransfer(true)}>
                      Transfer workspace ownership
                    </button>
                  )}
              </div>
            </section>
          )}
        </>
      )}
      {transfer && (
        <Modal
          title="Transfer workspace ownership"
          onClose={() => setTransfer(false)}
        >
          <p>
            You will become an admin. This grants no private project access. A
            recent sign-in is required.
          </p>
          <InlineError error={error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "transfer",
                userId: String(new FormData(e.currentTarget).get("userId")),
              });
            }}
          >
            <label>
              New owner
              <select name="userId">
                {members.data
                  ?.filter((m) => m.userId !== userId)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} · {m.email}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Transfer ownership
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
