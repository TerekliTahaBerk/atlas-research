"use client";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import {
  Failure,
  InlineError,
  Loading,
  Modal,
  ThemeControl,
  useResource,
} from "./ui";
import { WorkspaceShell, type Me, type Workspace } from "./workspace-shell";
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
    >
      {({ me, workspaces, reload }) =>
        workspaceId ? (
          <WorkspaceSettings
            key={workspaceId}
            workspace={workspaces.find((w) => w.id === workspaceId)}
            userId={me.user.id}
            reload={reload}
          />
        ) : (
          <AccountSettings me={me} />
        )
      }
    </WorkspaceShell>
  );
}
function AccountSettings({ me }: { me: Me }) {
  const sessions = useResource<{ sessions: Session[] }>("/api/me/sessions"),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(
        "/api/me",
        { name: String(new FormData(event.currentTarget).get("name")) },
        "PATCH",
      );
      setNotice("Profile saved.");
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string, current: boolean) {
    setBusy(true);
    try {
      await api("/api/me/sessions", { sessionId: id });
      if (current) location.assign(location.origin + "/sign-in");
      else sessions.reload();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-content">
      <h1>Account settings</h1>
      <section className="settings-section">
        <h2>Profile</h2>
        <form onSubmit={save}>
          <label>
            Name
            <input
              name="name"
              defaultValue={me.user.name}
              required
              maxLength={80}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={me.user.email}
              readOnly
              aria-describedby="email-help"
            />
          </label>
          <small id="email-help">Your verified sign-in address.</small>
          <button className="primary" disabled={busy}>
            Save profile
          </button>
        </form>
        <InlineError error={error} />
        <p role="status">{notice}</p>
      </section>
      <section className="settings-section">
        <h2>Appearance</h2>
        <p>Choose the theme that works for you on this device.</p>
        <ThemeControl />
      </section>
      <section className="settings-section">
        <h2>Sessions</h2>
        <p>Revoke a session to sign that device out immediately.</p>
        {sessions.error ? (
          sessions.error instanceof ApiError &&
          sessions.error.code === "REAUTH_REQUIRED" ? (
            <p className="notice">
              To manage signed-in devices,{" "}
              <Link href="/sign-in?next=%2Fsettings">sign in again</Link>. Your
              research stays saved.
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
                    Started {new Date(s.createdAt).toLocaleString()} · Expires{" "}
                    {new Date(s.expiresAt).toLocaleDateString()}
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
      </section>
    </div>
  );
}
function WorkspaceSettings({
  workspace,
  userId,
  reload,
}: {
  workspace: Workspace | undefined;
  userId: string;
  reload: () => void;
}) {
  const members = useResource<Member[]>(
      workspace ? `/api/workspaces/${workspace.id}/members` : null,
    ),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [transfer, setTransfer] = useState(false),
    [notice, setNotice] = useState("");
  if (!workspace) return <Failure error={null} retry={reload} />;
  const role = members.data?.find((m) => m.userId === userId)?.role;
  async function mutate(body: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/workspaces/${workspace!.id}`, body, "PATCH");
      members.reload();
      reload();
      setTransfer(false);
      setNotice("Workspace updated.");
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-content">
      <div className="eyebrow">{workspace.kind} workspace</div>
      <h1>{workspace.name}</h1>
      <p>Project access is managed separately in each project.</p>
      {members.error ? (
        <Failure error={members.error} retry={members.reload} />
      ) : !members.data ? (
        <Loading />
      ) : (
        <>
          <section className="settings-section">
            <h2>Workspace settings</h2>
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
                Save workspace
              </button>
            </form>
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
            </div>
            <InlineError error={error} />
            <p role="status">{notice}</p>
          </section>
          <section className="settings-section">
            <h2>Members</h2>
            <p>
              A shared project invitation adds base membership. Workspace admins
              do not inherit private project access.
            </p>
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
                    (role === "owner" || m.role === "member") && (
                      <div className="member-actions">
                        {role === "owner" && m.role !== "owner" && (
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
                            void mutate({ action: "revoke", userId: m.userId })
                          }
                        >
                          Remove from workspace
                        </button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
            {workspace.kind === "shared" &&
              role === "owner" &&
              members.data.some((m) => m.userId !== userId) && (
                <button onClick={() => setTransfer(true)}>
                  Transfer workspace ownership
                </button>
              )}
          </section>
        </>
      )}
      {transfer && (
        <Modal
          title="Transfer workspace ownership"
          onClose={() => setTransfer(false)}
        >
          <p>
            You will become an admin. This does not grant access to any private
            project. A recent sign-in is required.
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
