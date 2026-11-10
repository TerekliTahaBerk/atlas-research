"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  WorkspaceShell,
  type Project,
  type Workspace,
} from "./workspace-shell";
import { EditProject } from "./project-overview";
import { Failure, InlineError, Loading, useResource } from "./ui";
export function ProjectSettings({ w, p }: { w: string; p: string }) {
  return (
    <WorkspaceShell title="Project settings" surface="settings">
      {({ reload }) => (
        <ProjectSettingsBody key={w + p} w={w} p={p} reload={reload} />
      )}
    </WorkspaceShell>
  );
}
function ProjectSettingsBody({
  w,
  p,
  reload,
}: {
  w: string;
  p: string;
  reload: () => void;
}) {
  const data = useResource<{
      project: Project;
      workspace: Workspace;
      role: string;
    }>(`/api/projects/${p}?workspaceId=${w}`),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  if (!data.data)
    return data.error ? (
      <Failure error={data.error} retry={data.reload} />
    ) : (
      <Loading />
    );
  const d = data.data,
    path = `/w/${w}/p/${p}`,
    manage = ["owner", "admin"].includes(d.role),
    archived = !!(
      d.project.archivedAt ||
      d.project.deletedAt ||
      d.workspace.archivedAt
    );
  async function archive() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(
        `/api/projects/${p}?workspaceId=${w}`,
        {
          action: "update",
          archived: !d.project.archivedAt,
          expectedUpdatedAt: d.project.updatedAt,
        },
        "PATCH",
      );
      data.reload();
      reload();
      setNotice("Project updated.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-content settings-scope">
      <Link href={path}>← Project Overview</Link>
      <header>
        <small>Project settings · {d.workspace.name}</small>
        <h1>{d.project.name}</h1>
        <p>Project permissions apply only to this research project.</p>
      </header>
      <InlineError error={error} />
      <p role="status">{notice}</p>
      <section className="settings-section">
        <h2>Research purpose</h2>
        <p className="settings-project-purpose">
          {d.project.description || "No research purpose added yet."}
        </p>
        {manage && !archived ? (
          <button onClick={() => setEditing(true)}>Edit project details</button>
        ) : (
          <p className="settings-muted">
            {archived
              ? "This project is read only."
              : "Owners and admins can edit project details."}
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>Members & invitations</h2>
        <p>
          Review project members and existing invitation capabilities. Workspace
          roles do not grant research access.
        </p>
        <Link className="button" href={path + "/members"}>
          Open project members
        </Link>
      </section>
      <section className="settings-section">
        <h2>Workspace settings</h2>
        <p>Workspace name and base membership are managed separately.</p>
        <Link href={`/w/${w}/settings`}>
          {d.workspace.name} · Workspace settings
        </Link>
      </section>
      {manage && !d.workspace.archivedAt && !d.project.deletedAt && (
        <section className="settings-section settings-administration">
          <h2>Project administration</h2>
          <p>Archiving preserves the research and makes it read only.</p>
          <button disabled={busy} onClick={() => void archive()}>
            {d.project.archivedAt
              ? "Restore project from archive"
              : "Archive project"}
          </button>
          <p className="settings-muted">
            Ownership is managed in Members. The existing deletion request and
            restore actions remain in the Overview project menu.
          </p>
        </section>
      )}
      {editing && (
        <EditProject
          data={{ project: d.project }}
          w={w}
          p={p}
          close={() => setEditing(false)}
          saved={() => {
            data.reload();
            reload();
            setNotice("Project details saved.");
          }}
        />
      )}
    </div>
  );
}
