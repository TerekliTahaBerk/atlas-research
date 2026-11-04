import { FileText } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ConceptTag } from '../components/ConceptTag';
import { FeatureTitle } from '../components/FeatureTitle';
import { Icon } from '../components/Icon';
import { KnowledgeGraph, SemanticField, type GEdge, type GNode } from '../components/KnowledgeGraph';
import { Stage } from '../components/Stage';
import { graphEdges, graphNodes, insight } from '../data/demoResearch';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, mix, progress } from '../design/motion';
import { color, kind } from '../design/tokens';
import { font } from '../design/typography';

const filters: Array<[keyof typeof kind, string]> = [
  ['paper', 'Papers'],
  ['doc', 'Documents'],
  ['ms', 'Manuscripts'],
  ['task', 'Tasks'],
  ['exp', 'Experiments'],
  ['ch', 'Channels'],
];

/** 00:33–00:41 — the centrepiece: a note becomes a node, the node a network. */
export const ConnectScene: React.FC<{ bare?: boolean }> = ({ bare = false }) => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const area = portrait ? { left: 70, top: 560, width: 940, height: 1060 } : { left: 150, top: 236, width: 1620, height: 760 };

  const sel = localCue('connect', 'nodeSelect');
  const emerge = [
    sel - 2,
    localCue('connect', 'nodeEmergeA'),
    localCue('connect', 'nodeEmergeB'),
    localCue('connect', 'nodeEmergeC'),
    localCue('connect', 'nodeEmergeD'),
  ];
  const reorg = localCue('connect', 'reorganize');
  const pull = localCue('connect', 'pullBack');
  const toTask = 216;

  const r = progress(frame, reorg, reorg + 52, ease.inOut);
  const focus: Record<string, number> = {
    note: progress(frame, sel, sel + 12, ease.out) * (1 - progress(frame, reorg, reorg + 30, ease.inOut)),
    rq: progress(frame, reorg + 10, reorg + 40, ease.out) * (1 - 0.6 * progress(frame, toTask, toTask + 20, ease.inOut)),
    t27: progress(frame, toTask, toTask + 20, ease.out),
  };
  const field = progress(frame, pull, pull + 60, ease.inOut);

  const appearStart = (order: number) => emerge[Math.min(order, emerge.length - 1)] ?? 0;
  const neighbours = (id: string) =>
    new Set(graphEdges.filter(([a, b]) => a === id || b === id).flatMap(([a, b]) => [a, b]));
  const nb = Object.fromEntries(Object.keys(focus).map((f) => [f, neighbours(f)]));

  const pos = (n: (typeof graphNodes)[number]) => {
    const a = portrait ? n.ap : n.a;
    const b = portrait ? n.bp : n.b;
    return { x: (mix(a[0], b[0], r) / 100) * area.width, y: (mix(a[1], b[1], r) / 100) * area.height };
  };

  const nodes: GNode[] = graphNodes.map((n) => {
    const p = pos(n);
    const near = Math.max(field * 0.85, ...Object.entries(focus).map(([f, w]) => (nb[f]?.has(n.id) ? w : 0)));
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      x: p.x,
      y: p.y,
      appear: progress(frame, appearStart(n.order), appearStart(n.order) + 22, ease.out),
      selected: focus[n.id] ?? 0,
      near,
    };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const startOf = (id: string) => appearStart(graphNodes.find((g) => g.id === id)?.order ?? 0);
  const edges: GEdge[] = graphEdges.flatMap(([a, b]) => {
    const A = byId[a];
    const B = byId[b];
    if (!A || !B) return [];
    const [first, second] = startOf(a) <= startOf(b) ? [A, B] : [B, A];
    const s0 = Math.max(startOf(a), startOf(b)) + 6;
    return [
      {
        x1: first.x,
        y1: first.y,
        x2: second.x,
        y2: second.y,
        draw: progress(frame, s0, s0 + 22, ease.out),
        active: Math.max(focus[a] ?? 0, focus[b] ?? 0),
      },
    ];
  });

  // Camera: from the note, back through the network, out to the field.
  const cam = {
    s:
      frame < reorg
        ? mix(1.55, 1.08, progress(frame, 0, reorg, ease.inOut))
        : frame < pull
          ? mix(1.08, 1.0, progress(frame, reorg, pull, ease.inOut))
          : mix(1.0, portrait ? 0.82 : 0.8, progress(frame, pull, pull + 70, ease.inOut)),
  };
  const t27 = byId.t27;
  const pan = progress(frame, toTask, 254, ease.inOut);
  const panX = t27 ? (area.width / 2 - t27.x) * 0.35 * pan : 0;
  const panY = t27 ? (area.height / 2 - t27.y) * 0.35 * pan : 0;
  const s = cam.s * mix(1, 1.12, pan);

  const card = 1 - progress(frame, 2, 20, ease.inOut);

  return (
    <Stage>
      <AbsoluteFill
        style={{
          opacity: 0.55 * progress(frame, 0, 40),
          backgroundImage: `radial-gradient(circle, ${color.bd} 1px, transparent 1.3px)`,
          backgroundSize: `${22 * s}px ${22 * s}px`,
          backgroundPosition: `${area.left + area.width / 2 + panX}px ${area.top + area.height / 2 + panY}px`,
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 58%, #000 40%, transparent 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: area.left,
          top: area.top,
          width: area.width,
          height: area.height,
          transformOrigin: '50% 50%',
          transform: `translate(${panX}px, ${panY}px) scale(${s})`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: portrait ? -380 : -520,
            top: portrait ? -420 : -330,
            width: area.width + (portrait ? 760 : 1040),
            height: area.height + (portrait ? 840 : 660),
            opacity: field * 0.7,
          }}
        >
          <SemanticField
            width={area.width + (portrait ? 760 : 1040)}
            height={area.height + (portrait ? 840 : 660)}
            reveal={field}
            portrait={portrait}
          />
        </div>
        <KnowledgeGraph nodes={nodes} edges={edges} width={area.width} height={area.height} scale={s} />
        {card > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: area.width / 2,
              top: area.height / 2,
              transform: `translate(-50%, -50%) scale(${mix(0.55, 1, card)})`,
              width: 420,
              padding: 16,
              borderRadius: 12,
              background: color.card,
              border: `1px solid ${color.bd}`,
              opacity: card,
              fontFamily: font.sans,
              color: color.tx,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.tx2, marginBottom: 8 }}>
              <Icon icon={FileText} size={14} tint={kind.doc} />
              {insight.noteTitle}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{insight.answer}</div>
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: portrait ? 400 : 92,
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: portrait ? '0 120px' : 0,
          opacity: bare || portrait ? 0 : progress(frame, 60, 90) * (1 - field * 0.4),
          fontFamily: font.sans,
        }}
      >
        <span style={{ fontSize: 13, color: color.tx3, alignSelf: 'center', marginRight: 4 }}>Show</span>
        {filters.map(([k, n]) => (
          <span
            key={k}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              padding: '0 10px',
              borderRadius: 12,
              border: `1px solid ${color.bd}`,
              fontSize: 13,
              color: color.tx,
              background: 'rgba(28,28,27,.8)',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: kind[k] }} />
            {n}
          </span>
        ))}
      </div>
      {bare ? null : (
        <>
          <FeatureTitle eyebrow="Knowledge graph · Semantic Map" headline="See how ideas connect." concept from={14} exitAt={228} />
          <ConceptTag from={40} />
        </>
      )}
    </Stage>
  );
};
