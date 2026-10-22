'use client';
import { useState } from 'react';
import { type ProjectDto, type MemberPage } from '@atlas/core';
import { Topbar, Crumb } from '@/features/shell/topbar';
import {
  AtlasAnchor,
  ContextualAITrigger,
} from '@/features/atlas-ai/atlas-surface';
import { modules } from '@/features/shell/navigation';
import { mutate } from './client';
import { buttonClass, inputClass } from './live-home';
import { MembershipPanel } from './membership-panel';
export function LiveProject({
  project,
  initialMembers,
  module = 'overview',
}: {
  project: ProjectDto;
  initialMembers: MemberPage;
  module?: string;
}) {
  const [name, setName] = useState(project.name);
  const [visibility, setVisibility] = useState(project.visibility);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = modules.find((m) => m.slug === module);
  async function change(
    command: 'project.update' | 'project.archive' | 'project.restore',
  ) {
    if (
      command === 'project.archive' &&
      !window.confirm(
        `Archive “${project.name}”? Members will lose access until an owner restores it.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await mutate(
        command === 'project.update'
          ? {
              command,
              id: project.id,
              expectedVersion: project.version,
              name,
              visibility,
            }
          : { command, id: project.id, expectedVersion: project.version },
      );
      window.location.reload();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to update project.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar bordered>
        <Crumb parent={project.name} title={active?.label ?? 'Overview'} />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-8 pt-[calc(52px+var(--aic))] pb-16 max-sm:px-4">
          <p className="mb-2 text-xs text-tx3">
            {project.archived
              ? 'Archived'
              : project.visibility === 'PRIVATE'
                ? 'Private project'
                : 'Workspace-visible project'}
          </p>
          <h1 className="mb-5 font-serif text-4xl font-medium">
            {project.name}
          </h1>
          <nav
            aria-label="Project modules"
            className="mb-7 flex flex-wrap gap-2"
          >
            {modules.map((m) => (
              <a
                key={m.slug}
                className="rounded-lg border border-bd px-3 py-2 text-xs text-tx2 hover:bg-hov"
                aria-current={m.slug === module ? 'page' : undefined}
                href={`/app/projects/${project.id}/${m.slug}`}
              >
                {m.label}
              </a>
            ))}
          </nav>
          {module !== 'overview' ? (
            <div className="rounded-2xl border border-bd2 bg-card p-6">
              <h2 className="mb-2 font-serif text-2xl">
                {active?.label} is coming in Phase {active?.phase}
              </h2>
              <p className="text-sm text-tx2">
                No research content, AI generation, compilation or execution is
                available here yet.
              </p>
              <div className="mt-4">
                <ContextualAITrigger>
                  Open Atlas AI presentation
                </ContextualAITrigger>
              </div>
            </div>
          ) : (
            <>
              {project.capabilities.includes('project.update') ? (
                <form
                  className="flex max-w-[520px] flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change('project.update');
                  }}
                >
                  <label className="text-xs text-tx2">
                    Project name
                    <input
                      className={inputClass}
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-tx2">
                    Visibility
                    <select
                      className={inputClass}
                      value={visibility}
                      onChange={(e) =>
                        setVisibility(e.target.value as typeof visibility)
                      }
                    >
                      <option value="PRIVATE">Private</option>
                      <option value="WORKSPACE">Workspace</option>
                    </select>
                  </label>
                  <p className="text-xs text-tx3">
                    Workspace visibility lets every active workspace member read
                    this project.
                  </p>
                  <button disabled={busy} className={buttonClass}>
                    Save project
                  </button>
                </form>
              ) : null}
              {project.capabilities.includes('project.archive') ? (
                <button
                  disabled={busy}
                  type="button"
                  className="mt-4 text-xs text-danger"
                  onClick={() => void change('project.archive')}
                >
                  Archive project
                </button>
              ) : null}
              {project.capabilities.includes('project.restore') ? (
                <button
                  disabled={busy}
                  type="button"
                  className={buttonClass}
                  onClick={() => void change('project.restore')}
                >
                  Restore project
                </button>
              ) : null}
              {project.capabilities.includes('project.read') ? (
                <MembershipPanel
                  scope="project"
                  scopeId={project.id}
                  capabilities={project.capabilities}
                  initial={initialMembers}
                />
              ) : null}
            </>
          )}
          {error ? (
            <p role="alert" className="mt-4 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
