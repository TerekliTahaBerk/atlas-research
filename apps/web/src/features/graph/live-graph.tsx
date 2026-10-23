'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  ListTodo,
  Network,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  relationshipLabels,
  type ArtifactKind,
  type GraphDto,
  type ProjectDto,
} from '@atlas/core';
import { Btn } from '@/components/atlas/button';
import {
  EmptyState,
  ErrorBanner,
  SkeletonLines,
} from '@/components/atlas/states';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { fetchGraph } from '@/features/artifacts/client';

/** Same kind colours as the approved graph; only real artifacts appear. */
const kinds: {
  kind: ArtifactKind;
  label: string;
  color: string;
  icon: typeof BookOpen;
}[] = [
  { kind: 'PAPER', label: 'Papers', color: '#c99a3e', icon: BookOpen },
  { kind: 'DOCUMENT', label: 'Documents', color: '#8e9ac9', icon: FileText },
  { kind: 'TASK', label: 'Tasks', color: '#b08aae', icon: ListTodo },
];
const meta = (k: ArtifactKind) => kinds.find((x) => x.kind === k)!;

/**
 * Typed adapter from the authorized graph projection to the approved
 * knowledge-graph layout. Positions are a deterministic per-kind ring, not
 * an analysis result; nothing synthetic is shown in live mode.
 */
export function LiveGraph({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const { setContext } = useAtlas();
  const [graph, setGraph] = useState<GraphDto | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<ArtifactKind, boolean>>({
    PAPER: true,
    DOCUMENT: true,
    TASK: true,
  });
  useEffect(() => {
    let alive = true;
    fetchGraph(project.id)
      .then((g) => alive && setGraph(g))
      .catch(
        (e: unknown) =>
          alive &&
          setError(
            e instanceof Error ? e.message : 'The graph is unavailable.',
          ),
      );
    return () => {
      alive = false;
    };
  }, [project.id]);
  useEffect(() => {
    setContext([
      {
        id: `project:${project.id}`,
        kind: 'graph',
        title: `Graph · ${project.name}`,
        research: { kind: 'project', projectId: project.id },
      },
    ]);
  }, [project.id, project.name, setContext]);
  const positioned = useMemo(() => {
    if (!graph) return [];
    return kinds.flatMap(({ kind }, ring) => {
      const nodes = graph.nodes.filter((n) => n.kind === kind);
      return nodes.map((n, i) => {
        const angle =
          (2 * Math.PI * i) / Math.max(1, nodes.length) + ring * 0.6;
        const radius = 14 + ring * 14;
        return {
          ...n,
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * 0.82 * Math.sin(angle),
        };
      });
    });
  }, [graph]);
  const visible = positioned.filter((n) => filters[n.kind]);
  const ids = new Set(visible.map((n) => n.artifactId));
  const edges = (graph?.edges ?? []).filter(
    (e) => ids.has(e.source) && ids.has(e.target),
  );
  const focus = hover ?? selected;
  const linksOf = (id: string) =>
    edges
      .filter((e) => e.source === id || e.target === id)
      .map((e) => ({
        edge: e,
        node: positioned.find(
          (n) => n.artifactId === (e.source === id ? e.target : e.source),
        )!,
      }))
      .filter((l) => l.node);
  const sel =
    positioned.find((n) => n.artifactId === selected) ?? visible[0] ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb parent={project.name} title="Knowledge graph" as="span" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-[calc(48px+var(--aic))] pb-2.5 max-sm:px-4">
        <h1 className="mr-2.5 font-serif text-[30px] leading-none font-medium">
          How it connects
        </h1>
        <div
          role="group"
          aria-label="Filter node types"
          className="flex flex-wrap gap-1.5"
        >
          {kinds.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={filters[k.kind]}
              onClick={() =>
                setFilters((f) => ({ ...f, [k.kind]: !f[k.kind] }))
              }
              className={cn(
                'inline-flex h-[26px] items-center gap-1.5 rounded-[13px] border px-[9px] text-xs transition-opacity',
                filters[k.kind] ? 'border-bd text-tx' : 'border-bd2 text-tx3',
              )}
            >
              <span
                aria-hidden="true"
                className="size-[7px] rounded-full"
                style={{ background: k.color }}
              />
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="px-5">
          <ErrorBanner title="Graph unavailable">{error}</ErrorBanner>
        </div>
      ) : !graph ? (
        <div className="px-5">
          <SkeletonLines />
        </div>
      ) : !graph.nodes.length ? (
        <EmptyState
          icon={Network}
          title="Nothing to connect yet"
          description="Save papers, write documents and plan tasks; citations and typed links appear here."
        />
      ) : (
        <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
          <div className="relative mr-3 mb-3 ml-5 min-h-[320px] min-w-0 flex-1 overflow-auto rounded-2xl border border-bd2 bg-card max-sm:mx-4">
            <div className="relative h-full min-h-[420px] min-w-[640px]">
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
              >
                {edges.map((e) => {
                  const A = positioned.find((n) => n.artifactId === e.source);
                  const B = positioned.find((n) => n.artifactId === e.target);
                  if (!A || !B) return null;
                  const on = e.source === focus || e.target === focus;
                  return (
                    <line
                      key={e.id}
                      x1={A.x}
                      y1={A.y}
                      x2={B.x}
                      y2={B.y}
                      stroke={on ? 'var(--actx)' : 'var(--bd)'}
                      strokeWidth={on ? 1.6 : 1}
                      opacity={on ? 1 : 0.7}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
              <ul aria-label="Graph nodes">
                {visible.map((n) => {
                  const k = meta(n.kind);
                  return (
                    <li key={n.artifactId}>
                      <button
                        type="button"
                        aria-pressed={n.artifactId === sel?.artifactId}
                        aria-label={`${n.title} — ${k.label}, ${linksOf(n.artifactId).length} links`}
                        onClick={() => setSelected(n.artifactId)}
                        onMouseEnter={() => setHover(n.artifactId)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(n.artifactId)}
                        onBlur={() => setHover(null)}
                        className={cn(
                          'absolute flex h-[30px] max-w-[220px] -translate-x-1/2 -translate-y-1/2 items-center gap-[7px] rounded-[15px] border pr-2.5 pl-1 text-xs whitespace-nowrap shadow-[0_2px_8px_rgb(0_0_0/0.18)]',
                          n.artifactId === sel?.artifactId
                            ? 'border-tx bg-el'
                            : 'border-bd bg-pop',
                        )}
                        style={{ left: `${n.x}%`, top: `${n.y}%` }}
                      >
                        <span
                          className="grid size-[22px] shrink-0 place-items-center rounded-full bg-el"
                          style={{ color: k.color }}
                        >
                          <k.icon aria-hidden="true" className="size-3" />
                        </span>
                        <span className="truncate">{n.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="absolute bottom-2.5 left-3 text-[11px] text-tx3">
                {graph.nodes.length} artifacts · {graph.edges.length} links
                {graph.truncated ? ' · showing the 300 most recent' : ''}
              </p>
            </div>
          </div>
          {sel ? (
            <aside
              aria-label="Selected item"
              className="w-[300px] shrink-0 overflow-auto pr-4 pb-4 pl-1 max-lg:w-full max-lg:px-5"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: meta(sel.kind).color }}
                />
                <span className="text-[11.5px] text-tx3">
                  {meta(sel.kind).label}
                </span>
              </div>
              <h2 className="mb-3 font-serif text-2xl leading-[1.15] font-medium">
                {sel.title}
              </h2>
              <div className="mb-[18px] flex gap-1.5">
                <Btn
                  variant="primary"
                  className="px-[11px]"
                  onClick={() => router.push(sel.href)}
                >
                  <ArrowUpRight aria-hidden="true" />
                  Open
                </Btn>
              </div>
              <h3 className="mb-1.5 text-[11.5px] text-tx3">Linked to</h3>
              <ul>
                {linksOf(sel.artifactId).map(({ edge, node }) => (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(node.artifactId)}
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ctl hover:bg-hov"
                    >
                      <span
                        aria-hidden="true"
                        className="size-[7px] rounded-full"
                        style={{ background: meta(node.kind).color }}
                      />
                      <span className="flex-1 truncate">{node.title}</span>
                      <span className="text-[11px] text-tx3">
                        {
                          relationshipLabels[edge.relationship][
                            edge.source === sel.artifactId ? 0 : 1
                          ]
                        }
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
