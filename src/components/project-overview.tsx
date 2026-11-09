"use client";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { OverviewDashboard } from "@/lib/dashboard-types";
import {
  Failure,
  Icon,
  InlineError,
  Loading,
  Modal,
  PopoverMenu,
  useResource,
} from "./ui";
import { CreateArtifactDialog } from "./collaboration-shared";
import { SourceForm } from "./research-source";
import {
  DashboardTasks,
  displayDate,
  useCalendarToday,
} from "./dashboard-shared";
import { usePageTitle } from "./working-tabs";
export function ProjectOverview({
  w,
  p,
  onChanged,
}: {
  w: string;
  p: string;
  onChanged: () => void;
}) {
  const data = useResource<OverviewDashboard>(
      `/api/projects/${p}/overview?workspaceId=${w}`,
      false,
      true,
    ),
    today = useCalendarToday();
  const [create, setCreate] = useState<
      "source" | "document" | "task" | "discussion" | null
    >(null),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const project = data.data?.project;
  usePageTitle(project?.name ?? "Overview");
  async function manage(change: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(
        `/api/projects/${p}?workspaceId=${w}`,
        { action: "update", ...change },
        "PATCH",
      );
      data.reload();
      onChanged();
      setDeleting(false);
      setNotice("Project updated.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!data.data)
    return data.error ? (
      <Failure error={data.error} retry={data.reload} />
    ) : (
      <Loading />
    );
  const d = data.data,
    path = `/w/${w}/p/${p}`,
    archived = !!(
      d.project.archivedAt ||
      d.project.deletedAt ||
      d.workspace.archivedAt
    );
  return (
    <div className="project-overview">
      <header className="overview-heading">
        <div>
          <small>Project · {d.workspace.name}</small>
          <h1>{d.project.name}</h1>
          <p className="overview-purpose">
            {d.project.description || "No research purpose added yet."}
          </p>
        </div>
        <div className="overview-heading-actions">
          {d.canManage && !archived && (
            <button onClick={() => setEditing(true)}>
              {d.project.description ? "Edit project" : "Add research purpose"}
            </button>
          )}
          <PopoverMenu className="action-menu">
            <summary className="icon-button" aria-label="Project actions">
              <Icon name="options" />
            </summary>
            <div>
              <Link href={path + "/members"}>Project members</Link>
              {d.canManage &&
                !d.workspace.archivedAt &&
                !d.project.deletedAt && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void manage({ archived: !d.project.archivedAt })
                    }
                  >
                    {d.project.archivedAt
                      ? "Restore from archive"
                      : "Archive project"}
                  </button>
                )}
              {d.role === "owner" &&
                !d.workspace.archivedAt &&
                (d.project.deletedAt ? (
                  <button
                    disabled={busy}
                    onClick={() => void manage({ deletion: "restore" })}
                  >
                    Restore project
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => setDeleting(true)}>
                    Request project deletion
                  </button>
                ))}
            </div>
          </PopoverMenu>
        </div>
      </header>
      {archived && (
        <p className="notice" role="status">
          {d.project.deletedAt
            ? "Deletion requested · the owner can restore this project."
            : "Archived · available to read."}
        </p>
      )}
      {!!(error ?? data.error) && <InlineError error={error ?? data.error} />}{" "}
      {notice && (
        <p className="dashboard-footnote" role="status">
          {notice}
        </p>
      )}
      <nav className="overview-resource-nav" aria-label="Project content">
        <Link href={path + "/sources"}>
          Library <span>{d.counts.sources}</span>
        </Link>
        <Link href={path + "/docs"}>
          Documents <span>{d.counts.documents}</span>
        </Link>
        <Link href={path + "/tasks"}>
          Active tasks <span>{d.counts.tasks}</span>
        </Link>
        <Link href={path + "/discussions"}>
          Discussions <span>{d.counts.discussions}</span>
        </Link>
      </nav>
      {d.canEdit && (
        <div
          className="overview-create-actions"
          aria-label="Create project content"
        >
          <button onClick={() => setCreate("source")}>
            <Icon name="plus" /> Add source
          </button>
          <button onClick={() => setCreate("document")}>
            <Icon name="note" /> New document
          </button>
          <button onClick={() => setCreate("task")}>
            <Icon name="check" /> New task
          </button>
          <button onClick={() => setCreate("discussion")}>
            <Icon name="discussion" /> New discussion
          </button>
        </div>
      )}
      {!d.hasContent && !archived ? (
        <section className="overview-start">
          <h2>Start your research</h2>
          <p>A short path from a question to a useful next step.</p>
          <ol>
            <li>
              <strong>Add a source</strong>
              <span>Keep a paper or reference in this project.</span>
            </li>
            <li>
              <strong>Write a note</strong>
              <span>
                Capture the evidence and questions you want to explore.
              </span>
            </li>
            <li>
              <strong>Plan a next step</strong>
              <span>Create a task or open a discussion with your team.</span>
            </li>
          </ol>
          {!d.canEdit && (
            <p>Project editors can add the first source and document.</p>
          )}
        </section>
      ) : (
        <div className="overview-columns">
          <section>
            <div className="section-heading">
              <h2>Sources</h2>
              <Link href={path + "/sources"}>
                View all · {d.counts.sources}
              </Link>
            </div>
            <p className="dashboard-section-note">
              Linked to project documents, then recently updated.
            </p>
            <div className="dashboard-rows">
              {d.sources.map((s) => (
                <Link className="dashboard-row" key={s.id} href={s.href}>
                  <Icon name="book" />
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {[
                        s.authors.slice(0, 2).join(", "),
                        s.year,
                        s.references
                          ? `Linked to ${s.references} document${s.references === 1 ? "" : "s"}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
            {!d.sources.length && (
              <p className="dashboard-empty">No active sources.</p>
            )}
          </section>
          <section>
            <div className="section-heading">
              <h2>Project documents</h2>
              <Link href={path + "/docs"}>View all · {d.counts.documents}</Link>
            </div>
            <div className="dashboard-rows">
              {d.documents.map((doc) => (
                <Link className="dashboard-row" key={doc.id} href={doc.href}>
                  <Icon name="note" />
                  <span>
                    <strong>{doc.title}</strong>
                    <small>
                      Revision {doc.revision} · Updated{" "}
                      {displayDate(doc.updatedAt)}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
            {!d.documents.length && (
              <p className="dashboard-empty">No active documents.</p>
            )}
          </section>
          <section>
            <div className="section-heading">
              <h2>Priority research work</h2>
              <Link href={path + "/tasks"}>
                View all · {d.counts.tasks} active
              </Link>
            </div>
            <p className="dashboard-section-note">
              Active work, ordered by priority and due date.
            </p>
            <DashboardTasks items={d.tasks} today={today} />
            {!d.tasks.length && (
              <p className="dashboard-empty">No active tasks.</p>
            )}
          </section>
          <section>
            <div className="section-heading">
              <h2>Latest discussions</h2>
              <Link href={path + "/discussions"}>
                View all · {d.counts.discussions}
              </Link>
            </div>
            <div className="dashboard-rows">
              {d.discussions.map((topic) => (
                <Link
                  className="dashboard-row"
                  key={topic.id}
                  href={topic.href}
                >
                  <Icon name="discussion" />
                  <span>
                    <strong>{topic.title}</strong>
                    <small>Updated {displayDate(topic.updatedAt)}</small>
                  </span>
                </Link>
              ))}
            </div>
            {!d.discussions.length && (
              <p className="dashboard-empty">No active discussions.</p>
            )}
          </section>
          <section className="overview-recent">
            <div className="section-heading">
              <h2>Recently updated</h2>
            </div>
            <p className="dashboard-section-note">
              Latest saved changes to this project’s research objects.
            </p>
            <div className="dashboard-rows">
              {d.activity.map((item) => (
                <Link
                  key={item.kind + item.id}
                  className="dashboard-row"
                  href={item.href}
                >
                  <Icon
                    name={
                      item.kind.startsWith("Document")
                        ? "note"
                        : item.kind.startsWith("Source")
                          ? "book"
                          : item.kind.startsWith("Task")
                            ? "check"
                            : "discussion"
                    }
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind} · {displayDate(item.updatedAt)}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
            {!d.activity.length && (
              <p className="dashboard-empty">No active research updates.</p>
            )}
          </section>
        </div>
      )}
      {editing && (
        <EditProject
          data={d}
          w={w}
          p={p}
          close={() => setEditing(false)}
          saved={() => {
            data.reload();
            onChanged();
          }}
        />
      )}
      {create === "source" && (
        <Modal title="Add source" onClose={() => setCreate(null)}>
          <SourceForm
            w={w}
            p={p}
            onSaved={() => {
              setCreate(null);
              data.reload();
            }}
          />
        </Modal>
      )}
      {create && create !== "source" && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind={create}
          onClose={() => {
            setCreate(null);
            data.reload();
          }}
        />
      )}
      {deleting && (
        <Modal
          title="Request project deletion"
          onClose={() => setDeleting(false)}
        >
          <p>
            This archives the project and revokes pending invitations. A recent
            sign-in is required. The existing recovery policy applies.
          </p>
          <InlineError error={error} />
          <button
            className="danger"
            disabled={busy}
            onClick={() => void manage({ deletion: "request" })}
          >
            Confirm deletion request
          </button>
        </Modal>
      )}
    </div>
  );
}
function EditProject({
  data,
  w,
  p,
  close,
  saved,
}: {
  data: OverviewDashboard;
  w: string;
  p: string;
  close: () => void;
  saved: () => void;
}) {
  const [base, setBase] = useState(data.project),
    [name, setName] = useState(data.project.name),
    [description, setDescription] = useState(data.project.description),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [latest, setLatest] = useState<OverviewDashboard["project"]>();
  return (
    <Modal title="Edit project" onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(undefined);
          try {
            await api(
              `/api/projects/${p}?workspaceId=${w}`,
              {
                action: "update",
                name,
                description,
                expectedUpdatedAt: base.updatedAt,
              },
              "PATCH",
            );
            saved();
            close();
          } catch (e) {
            setError(e);
            if (e instanceof ApiError && e.status === 409) {
              const current = await api<OverviewDashboard>(
                `/api/projects/${p}/overview?workspaceId=${w}`,
              ).catch(() => undefined);
              if (current) setLatest(current.project);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Project name
          <input
            aria-label="Project name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Research purpose
          <textarea
            aria-label="Research purpose"
            maxLength={500}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <small>
          Written by your team. This is not an AI-generated summary.
        </small>
        <InlineError error={error} />
        {latest && (
          <section>
            <p>Project details changed. Your text is kept.</p>
            <blockquote>
              {latest.name}
              <br />
              {latest.description}
            </blockquote>
            <button
              type="button"
              onClick={() => {
                setName(latest.name);
                setDescription(latest.description);
                setBase(latest);
                setLatest(undefined);
                setError(undefined);
              }}
            >
              Use latest details
            </button>
            <button
              type="button"
              onClick={() => {
                if (name === base.name) setName(latest.name);
                if (description === base.description)
                  setDescription(latest.description);
                setBase(latest);
                setLatest(undefined);
                setError(undefined);
              }}
            >
              Review my changed fields
            </button>
          </section>
        )}
        <button disabled={busy}>Save project</button>
      </form>
    </Modal>
  );
}
