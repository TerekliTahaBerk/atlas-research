'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpen,
  FileCode,
  FileText,
  FlaskConical,
  Hash,
  ListTodo,
  Sparkles,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn } from '@/components/atlas/button';
import { SampleTag } from '@/components/atlas/chips';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { resolveHref } from '@/features/shell/navigation';
import { Crumb, Topbar } from '@/features/shell/topbar';
import {
  graphEdges,
  graphKinds,
  graphNodes,
  graphSuggestions,
  type GraphKind,
  type GraphNode,
} from '@/lib/preview/extras';
const kindIcons: Record<GraphKind, typeof BookOpen> = {
  paper: BookOpen,
  doc: FileText,
  ms: FileCode,
  task: ListTodo,
  exp: FlaskConical,
  ch: Hash,
};
const color = (k: GraphKind) =>
  graphKinds.find((g) => g.kind === k)?.color ?? 'var(--tx3)';
function linksOf(id: string) {
  return graphEdges
    .filter(([a, b]) => a === id || b === id)
    .map(([a, b]) => graphNodes.find((n) => n.id === (a === id ? b : a)))
    .filter((n): n is GraphNode => Boolean(n));
}
/**
 * Knowledge graph (prototype "How it connects"): deterministic sample
 * nodes/edges, kind filters, hover/focus tracing and a detail panel.
 */
export function GraphScreen() {
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const [selected, setSelected] = useState('m');
  const [hover, setHover] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<GraphKind, boolean>>({
    paper: true,
    doc: true,
    ms: true,
    task: true,
    exp: true,
    ch: true,
  });
  const visible = graphNodes.filter((n) => filters[n.kind]);
  const ids = new Set(visible.map((n) => n.id));
  const focus = hover ?? selected;
  const neighbours = new Set([focus, ...linksOf(focus).map((n) => n.id)]);
  const sel =
    graphNodes.find((n) => n.id === selected) ?? (graphNodes[0] as GraphNode);
  const SelIcon = kindIcons[sel.kind];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb parent="Sparse Evoformer" title="Knowledge graph" as="span" />
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
          {graphKinds.map((k) => (
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
      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        <div className="relative mr-3 mb-3 ml-5 min-h-[320px] min-w-0 flex-1 overflow-auto rounded-2xl border border-bd2 bg-card max-sm:mx-4">
          <div className="relative h-full min-h-[420px] min-w-[640px]">
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              {graphEdges
                .filter(([a, b]) => ids.has(a) && ids.has(b))
                .map(([a, b]) => {
                  const A = graphNodes.find((n) => n.id === a);
                  const B = graphNodes.find((n) => n.id === b);
                  if (!A || !B) return null;
                  const on = a === focus || b === focus;
                  return (
                    <line
                      key={a + b}
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
                const Icon = kindIcons[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      aria-pressed={n.id === selected}
                      aria-label={`${n.label} — ${graphKinds.find((g) => g.kind === n.kind)?.label ?? ''}, ${linksOf(n.id).length} links`}
                      onClick={() => setSelected(n.id)}
                      onMouseEnter={() => setHover(n.id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(n.id)}
                      onBlur={() => setHover(null)}
                      className={cn(
                        'absolute flex h-[30px] -translate-x-1/2 -translate-y-1/2 items-center gap-[7px] rounded-[15px] border pr-2.5 pl-1 text-xs whitespace-nowrap shadow-[0_2px_8px_rgb(0_0_0/0.18)] transition-[opacity,border-color]',
                        n.id === selected
                          ? 'border-tx bg-el'
                          : 'border-bd bg-pop',
                        neighbours.has(n.id) ? 'font-medium' : 'border-bd2',
                      )}
                      style={{ left: `${n.x}%`, top: `${n.y}%` }}
                    >
                      <span
                        className="grid size-[22px] place-items-center rounded-full bg-el"
                        style={{ color: color(n.kind) }}
                      >
                        <Icon aria-hidden="true" className="size-3" />
                      </span>
                      {n.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="absolute bottom-2.5 left-3 text-[11px] text-tx3">
              Hover or focus to trace links · click to inspect · sample data
            </p>
          </div>
        </div>
        <aside
          aria-label="Selected item"
          className="w-[300px] shrink-0 overflow-auto pr-4 pb-4 pl-1 max-lg:w-full max-lg:px-5"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: color(sel.kind) }}
            />
            <span className="text-[11.5px] text-tx3">{sel.sub}</span>
          </div>
          <h2 className="mb-3 flex items-center gap-2 font-serif text-2xl leading-[1.15] font-medium">
            <SelIcon aria-hidden="true" className="size-[18px] text-tx3" />
            {sel.label}
          </h2>
          <div className="mb-[18px] flex gap-1.5">
            <Btn
              variant="primary"
              className="px-[11px]"
              onClick={() => router.push(resolveHref(sel.href))}
            >
              <ArrowUpRight aria-hidden="true" />
              Open
            </Btn>
            <Btn
              variant="ai"
              onClick={() =>
                atlas.ask({
                  mode: 'open',
                  chips: [
                    { id: `g-${sel.id}`, kind: 'graph', title: sel.label },
                  ],
                  prompt: `How is ${sel.label} connected to the rest of the project?`,
                })
              }
            >
              <Sparkles aria-hidden="true" className="!size-3" />
              Explain links
            </Btn>
          </div>
          <h3 className="mb-1.5 text-[11.5px] text-tx3">Linked to</h3>
          <ul>
            {linksOf(sel.id).map((l) => {
              const Icon = kindIcons[l.kind];
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(l.id)}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ctl hover:bg-hov"
                  >
                    <span
                      aria-hidden="true"
                      className="size-[7px] rounded-full"
                      style={{ background: color(l.kind) }}
                    />
                    <span className="flex-1 truncate">{l.label}</span>
                    <Icon aria-hidden="true" className="size-3 text-tx3" />
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-[18px] mb-1.5 flex items-center gap-2 text-[11.5px] text-tx3">
            Atlas noticed <SampleTag>Sample</SampleTag>
          </h3>
          {graphSuggestions.map((g) => (
            <div
              key={g.text}
              className="mb-1.5 rounded-lg border border-dashed border-bd px-2.5 py-[9px] text-xs text-tx2"
            >
              {g.text}
              <button
                type="button"
                onClick={() =>
                  flash(`${g.action} is a preview — nothing was linked`)
                }
                className="mt-[5px] block text-[11.5px] text-actx hover:underline"
              >
                {g.action} →
              </button>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
