"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Failure, InlineError, Loading, useResource } from "./ui";
import { projectPath, WorkspaceShell, type Project } from "./workspace-shell";
type Preview = {
  id: string;
  projectName: string;
  workspaceName: string;
  role: string;
  expiresAt: string;
  accepted: boolean;
};
export function InvitationScreen({ token }: { token: string }) {
  return (
    <WorkspaceShell title="Invitation">
      {({ me }) => <InvitationBody token={token} email={me.user.email} />}
    </WorkspaceShell>
  );
}
function InvitationBody({ token, email }: { token: string; email: string }) {
  const preview = useResource<Preview>(`/api/invitations/${token}`),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    setError(undefined);
    try {
      const p = await api<Project>(`/api/invitations/${token}`, {});
      location.assign(projectPath(p));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  if (preview.error)
    return (
      <>
        <Failure error={preview.error} retry={preview.reload} />
        <p className="invite-help">
          Use the verified email that received this invitation. Expired or
          revoked invitations cannot be accepted.{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
          >
            Use a different account
          </Link>
        </p>
      </>
    );
  if (!preview.data) return <Loading />;
  return (
    <section className="invite-card">
      <div className="eyebrow">You’re invited</div>
      <h1>{preview.data.projectName}</h1>
      <p>
        Join {preview.data.workspaceName} as a project{" "}
        <strong>{preview.data.role}</strong>.
      </p>
      <p>
        Accepting as <strong>{email}</strong>. You will gain access to this
        project and base workspace membership.
      </p>
      <InlineError error={error} />
      <button className="primary" disabled={busy} onClick={accept}>
        {busy
          ? "Accepting…"
          : preview.data.accepted
            ? "Open project"
            : "Accept invitation"}
      </button>
      <p className="footnote">
        Expires{" "}
        {new Date(preview.data.expiresAt).toLocaleDateString("en-GB", {
          dateStyle: "medium",
        })}
      </p>
    </section>
  );
}
