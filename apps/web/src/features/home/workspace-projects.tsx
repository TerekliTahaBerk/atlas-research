'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { AvatarStack, CountBadge } from '@/components/atlas/chips';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { ResourceMenu } from '@/features/overlays/resource-menus';
import { moduleHref } from '@/features/shell/navigation';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { people, sampleWorkspace } from '@/lib/preview/people';
import { projects } from '@/lib/preview/workspace';
/** Workspace and project index (existing Phase 00 routes, new design). */
export function WorkspaceProjects({
  workspace = false,
}: {
  workspace?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb
          parent="Workspaces"
          title={workspace ? sampleWorkspace.name : 'Projects'}
          as="span"
        />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-[1440px] px-8 pt-[calc(52px+var(--aic))] pb-[72px] max-sm:px-4">
          <div className="mb-1.5 text-xs text-tx3">
            {sampleWorkspace.kind} · {sampleWorkspace.members} members · sample
            workspace
          </div>
          <h1 className="mb-6 flex items-center gap-2.5 font-serif text-4xl leading-[1.1] font-medium">
            {workspace ? sampleWorkspace.name : 'Projects'}{' '}
            <CountBadge className="font-sans">{projects.length}</CountBadge>
          </h1>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            <button
              type="button"
              aria-label="New project"
              onClick={() => router.push('/onboarding?step=5')}
              className="grid min-h-[180px] place-items-center rounded-2xl border-[1.5px] border-dashed border-bd text-tx3 hover:border-tx3 hover:bg-card hover:text-tx2"
            >
              <Plus aria-hidden="true" className="size-[30px] stroke-[1.25]" />
            </button>
            {projects.map((p) => (
              <article
                key={p.id}
                className="relative flex flex-col gap-3 rounded-2xl border border-transparent bg-card p-3 hover:border-bd2"
              >
                <div className="flex h-[110px] flex-col gap-[7px] overflow-hidden rounded-lg bg-el px-4 py-3.5">
                  <span className="text-[10.5px] text-tx3">{p.counts}</span>
                  <span className="font-serif text-[17px] leading-[1.2] text-tx2">
                    {p.description}
                  </span>
                </div>
                <div className="flex items-start gap-2 px-1">
                  <div className="min-w-0 flex-1">
                    <h2 className="mb-1 text-[15px] font-medium">
                      <Link
                        href={moduleHref('overview')}
                        className="after:absolute after:inset-0 after:content-['']"
                      >
                        {p.title}
                      </Link>
                    </h2>
                    <div className="text-xs text-tx3">{p.edited}</div>
                  </div>
                  <div className="relative z-10 flex flex-col items-end gap-1.5">
                    <ResourceMenu
                      title={p.title}
                      href={moduleHref('overview')}
                    />
                    <AvatarStack people={p.people.map((id) => people[id])} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
