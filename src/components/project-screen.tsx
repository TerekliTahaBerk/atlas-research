"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Capabilities } from "@/lib/capabilities";
import { Failure, Icon, InlineError, Loading, Modal, useResource } from "./ui";
import {
  projectPath,
  WorkspaceShell,
  type Project,
  type Workspace,
} from "./workspace-shell";
type Detail = { project: Project; workspace: Workspace; role: string };
export type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
type Members = {
  members: Member[];
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  }>;
  role: string;
};
export function ProjectScreen({
  w,
  p,
  section = "overview",
}: {
  w: string;
  p: string;
  section?: "overview" | "members";
}) {
  return (
    <WorkspaceShell
      surface={section}
      title={section === "members" ? "Members" : "Overview"}
    >
      {({ me, reload }) => (
        <ProjectBody
          key={`${w}/${p}/${section}`}
          w={w}
          p={p}
          section={section}
          userId={me.user.id}
          onChanged={reload}
        />
      )}
    </WorkspaceShell>
  );
}
function ProjectBody({
  w,
  p,
  section,
  userId,
  onChanged,
}: {
  w: string;
  p: string;
  section: string;
  userId: string;
  onChanged: () => void;
}) {
  const url = `/api/projects/${p}?workspaceId=${w}`,
    capabilities = useResource<Capabilities>(
      section === "members" ? "/api/capabilities" : null,
    ),
    detail = useResource<Detail>(url),
    members = useResource<Members>(
      section === "members"
        ? `/api/projects/${p}/members?workspaceId=${w}`
        : null,
    );
  const [modal, setModal] = useState<
      "edit" | "invite" | "delete" | "transfer" | null
    >(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const reload = () => {
    detail.reload();
    members.reload();
    onChanged();
  };
  async function mutate(body: unknown) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await api(url, body, "PATCH");
      reload();
      setModal(null);
      setNotice("Saved to Atlas.");
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  if (detail.error || members.error)
    return <Failure error={detail.error ?? members.error} retry={reload} />;
  if (!detail.data || (section === "members" && !members.data))
    return <Loading />;
  const { project, workspace, role } = detail.data,
    manage = ["owner", "admin"].includes(role),
    archived = !!(
      project.archivedAt ||
      workspace.archivedAt ||
      project.deletedAt
    ),
    path = projectPath(project);
  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void mutate({
      action: "update",
      name: String(f.get("name")),
      description: String(f.get("description")),
    });
  }
  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void mutate({
      action: "invite",
      email: String(f.get("email")),
      role: String(f.get("role")),
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="project-symbol">
            <Icon name="folder" />
          </div>
          <h1>{project.name}</h1>
          <p>
            {project.description ||
              "Your project is ready for its first research question."}
          </p>
        </div>
        {manage && !archived && (
          <button onClick={() => setModal("edit")}>Edit project</button>
        )}
      </div>
      {archived && (
        <div className="notice" role="status">
          {project.deletedAt
            ? "Deletion requested. The owner can restore this project within 30 days."
            : "Archived · This project is available to read."}
        </div>
      )}
      <InlineError error={error} />
      <p className="status" role="status">
        {notice}
      </p>
      {section === "overview" ? (
        <>
          <section className="overview-card">
            <span className="eyebrow">Project workspace</span>
            <h2>Start with a source</h2>
            <p>
              Discover a paper, keep it in your library, and read with your
              notes beside you.
            </p>
            <div className="actions">
              <Link className="button primary" href={`${path}/discover`}>
                Find papers
              </Link>
              <Link className="button" href={`${path}/sources`}>
                Open library
              </Link>
            </div>
            <dl>
              <div>
                <dt>Workspace</dt>
                <dd>{workspace.name}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>Private · Invited project members</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{role}</dd>
              </div>
            </dl>
            {workspace.kind === "shared" && manage && !archived && (
              <Link className="button" href={`${path}/members`}>
                <Icon name="people" />
                Manage members
              </Link>
            )}
          </section>
          {manage && (
            <section className="settings-section">
              <h2>Project lifecycle</h2>
              <p>
                Archiving preserves the project. Access can still be revoked
                while archived.
              </p>
              <div className="actions">
                {!workspace.archivedAt && !project.deletedAt && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        action: "update",
                        archived: !project.archivedAt,
                      })
                    }
                  >
                    {project.archivedAt
                      ? "Restore from archive"
                      : "Archive project"}
                  </button>
                )}
                {role === "owner" &&
                  !workspace.archivedAt &&
                  (project.deletedAt ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate({ action: "update", deletion: "restore" })
                      }
                    >
                      Restore project
                    </button>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => setModal("delete")}
                    >
                      Request project deletion
                    </button>
                  ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>Project members</h2>
              <p>Workspace roles do not grant access to this project.</p>
            </div>
            {manage && !archived && workspace.kind === "shared" && (
              <button
                className="primary"
                disabled={capabilities.data?.emailDelivery !== "smtp"}
                onClick={() => setModal("invite")}
              >
                <Icon name="plus" />
                Invite member
              </button>
            )}
          </div>
          {manage && capabilities.data?.emailDelivery === "disabled" && (
            <p role="status">
              Email invitations are currently unavailable. Existing member
              access can still be managed.
            </p>
          )}
          <ul className="member-list">
            {members.data?.members.map((m) => (
              <li key={m.userId}>
                <span className="avatar">{m.name?.slice(0, 1) || "R"}</span>
                <div className="member-info">
                  <strong>
                    {m.name}
                    {m.userId === userId ? " (you)" : ""}
                  </strong>
                  <span>{m.email}</span>
                </div>
                <span className="badge">{m.role}</span>
                {manage &&
                  (role === "owner" ||
                    !["owner", "admin"].includes(m.role)) && (
                    <div className="member-actions">
                      {m.role !== "owner" && !archived && (
                        <select
                          aria-label={`Role for ${m.email}`}
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
                          {role === "owner" && (
                            <option value="admin">Admin</option>
                          )}
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                      {m.userId !== userId && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({ action: "revoke", userId: m.userId })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
              </li>
            ))}
          </ul>
          {role === "owner" &&
            !archived &&
            members.data?.members.some((m) => m.userId !== userId) && (
              <button onClick={() => setModal("transfer")}>
                Transfer project ownership
              </button>
            )}
          {manage && (
            <section className="settings-section">
              <h2>Pending invitations</h2>
              {members.data?.invitations.length === 0 ? (
                <p>No pending invitations.</p>
              ) : (
                <ul className="member-list">
                  {members.data?.invitations.map((i) => (
                    <li key={i.id}>
                      <div className="member-info">
                        <strong>{i.email}</strong>
                        <span>
                          {i.role} · Expires{" "}
                          {new Date(i.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                      {(role === "owner" || i.role !== "admin") && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              action: "cancel-invite",
                              invitationId: i.id,
                            })
                          }
                        >
                          Revoke invitation
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "edit"
              ? "Edit project"
              : modal === "invite"
                ? "Invite a researcher"
                : modal === "transfer"
                  ? "Transfer ownership"
                  : "Request project deletion"
          }
          onClose={() => {
            setModal(null);
            setError(undefined);
          }}
        >
          <InlineError error={error} />
          {modal === "edit" ? (
            <form onSubmit={submitEdit}>
              <label>
                Name
                <input
                  name="name"
                  defaultValue={project.name}
                  required
                  maxLength={100}
                  autoFocus
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={project.description}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          ) : modal === "invite" ? (
            <form onSubmit={submitInvite}>
              <p>
                The invitation is tied to this email and expires in seven days.
              </p>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoFocus
                />
              </label>
              <label>
                Project role
                <select name="role" defaultValue="editor">
                  {role === "owner" && <option value="admin">Admin</option>}
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Queuing invitation…" : "Send invitation"}
              </button>
            </form>
          ) : modal === "transfer" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate({
                  action: "transfer",
                  userId: String(new FormData(e.currentTarget).get("userId")),
                });
              }}
            >
              <p>You will become an admin. A recent sign-in is required.</p>
              <label>
                New owner
                <select name="userId">
                  {members.data?.members
                    .filter((m) => m.userId !== userId)
                    .map((m) => (
                      <option value={m.userId} key={m.userId}>
                        {m.name} · {m.email}
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Transfer ownership
              </button>
            </form>
          ) : (
            <>
              <p>
                This archives the project and revokes pending invitations. You
                can restore it for 30 days. A recent sign-in is required.
              </p>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void mutate({ action: "update", deletion: "request" })
                }
              >
                Confirm deletion request
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
