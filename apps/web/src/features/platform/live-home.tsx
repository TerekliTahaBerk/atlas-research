'use client';
import { useRouter } from 'next/navigation';
import { TenantDirectory } from './tenant-directory';
import { useState } from 'react';
import { Plus, FolderKanban, LayoutGrid, List } from 'lucide-react';
import { type PlatformState } from '@atlas/core';
import { Topbar, Crumb } from '@/features/shell/topbar';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { Segmented } from '@/components/atlas/segmented';
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
} from '@/components/atlas/overlay';
import { mutate } from './client';
export const inputClass =
  'h-10 w-full rounded-lg border border-bd bg-card px-3 text-sm text-tx';
export const buttonClass =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-acb px-3 text-ui font-medium text-white hover:bg-acbh disabled:opacity-50';
export function LiveHome({
  state,
  workspace = false,
}: {
  state: PlatformState;
  workspace?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'WORKSPACE'>(
    'PRIVATE',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const selected = state.workspaces.find((w) => w.id === state.workspaceId);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb title={workspace ? (selected?.name ?? 'Workspaces') : 'Home'} />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-[1440px] px-8 pt-[calc(52px+var(--aic))] pb-[72px] max-sm:px-4">
          <h1 className="mb-[18px] font-serif text-4xl leading-[1.1] font-medium">
            {workspace
              ? (selected?.name ?? 'Your workspaces')
              : `Welcome, ${state.profile?.displayName}`}
          </h1>
          <p className="mb-6 text-ui text-tx2">
            {selected
              ? `${state.organizations.find((o) => o.id === selected.organizationId)?.name ?? ''} · ${selected.name}`
              : 'Choose or create a workspace to begin.'}
          </p>
          <TenantDirectory state={state} />
          {state.recentProject ? (
            <section className="mb-8">
              <h2 className="mb-2 text-xs text-tx3">Continue working</h2>
              <a
                href={`/app/projects/${state.recentProject.id}/overview`}
                className="flex items-center gap-3 rounded-lg border border-bd2 bg-card px-3 py-3 text-ui"
              >
                <FolderKanban aria-hidden="true" className="size-4 text-actx" />
                {state.recentProject.name}
              </a>
            </section>
          ) : null}
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-2xl font-medium">Projects</h2>
            <span className="rounded bg-el px-1.5 text-xs text-tx3">
              {state.projects.length}
            </span>
            <span className="flex-1" />
            <Segmented
              label="Layout"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
                { value: 'list', label: 'List', icon: <List /> },
              ]}
            />
          </div>
          <div
            className={
              view === 'grid'
                ? 'mb-8 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4'
                : 'mb-8 flex flex-col gap-2'
            }
          >
            {selected?.capabilities.includes('project.create') ? (
              <button
                type="button"
                aria-label="New project"
                onClick={() => {
                  setKey(crypto.randomUUID());
                  setOpen(true);
                  setError('');
                }}
                className="grid min-h-[180px] place-items-center rounded-2xl border-[1.5px] border-dashed border-bd text-tx3 hover:bg-card hover:text-tx2 max-sm:min-h-[96px]"
              >
                <Plus
                  aria-hidden="true"
                  className="size-[30px] stroke-[1.25]"
                />
              </button>
            ) : null}
            {state.projects.map((p) => (
              <article
                key={p.id}
                className="relative flex flex-col gap-3 rounded-2xl border border-transparent bg-card p-3 hover:border-bd2"
              >
                <div className="flex min-h-[110px] flex-col justify-between rounded-lg bg-el px-4 py-3.5">
                  <FolderKanban
                    aria-hidden="true"
                    className="size-5 text-actx"
                  />
                  <span className="text-xs text-tx3">
                    {p.archived
                      ? 'Archived'
                      : p.visibility === 'PRIVATE'
                        ? 'Private project'
                        : 'Workspace project'}
                  </span>
                </div>
                <div className="px-1 pb-1">
                  <h3 className="text-[15px] font-medium">
                    <a
                      href={`/app/projects/${p.id}/overview`}
                      className="after:absolute after:inset-0 after:content-['']"
                    >
                      {p.name}
                    </a>
                  </h3>
                  <p className="mt-1 text-xs text-tx3">
                    Updated {new Date(p.updatedAt).toISOString().slice(0, 10)}
                  </p>
                </div>
              </article>
            ))}
          </div>
          {state.projects.length === 0 ? (
            <p className="mb-8 text-sm text-tx2">
              No projects yet. Create your first research project when you’re
              ready.
            </p>
          ) : null}
          {state.nextCursor ? (
            <a
              className="text-actx underline"
              href={`?workspaceId=${state.workspaceId}&cursor=${encodeURIComponent(state.nextCursor)}`}
            >
              Next projects
            </a>
          ) : null}
          <div className="mt-8 rounded-xl border border-bd2 p-4 text-ui text-tx2">
            <h2 className="mb-2 font-serif text-xl text-tx">
              Your research starts here
            </h2>
            Documents, discovery, manuscripts and Atlas AI will arrive in later
            phases. Your workspace and project records are saved; no sample
            research is attached to them.
          </div>
        </div>
      </div>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalTitle className="font-serif text-2xl">
            Create research project
          </ModalTitle>
          <ModalDescription className="mt-1 mb-5 text-ui text-tx2">
            Projects start private. Workspace visibility grants read access to
            active workspace members.
          </ModalDescription>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selected || !key) return;
              setBusy(true);
              setError('');
              try {
                const result = await mutate({
                  command: 'project.create',
                  workspaceId: selected.id,
                  name,
                  visibility,
                  idempotencyKey: key,
                });
                router.push(`/app/projects/${result.id}/overview`);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to create the project.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="text-xs text-tx2">
              Project name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
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
            {error ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
            <button disabled={busy} className={buttonClass}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
