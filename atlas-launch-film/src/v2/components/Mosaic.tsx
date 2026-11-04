import React from 'react';
import { AtlasWorkspace } from '../../components/AtlasWorkspace';
import { KnowledgeGraph, SemanticField, type GEdge, type GNode } from '../../components/KnowledgeGraph';
import { ManuscriptInterface } from '../../components/ManuscriptInterface';
import { PaperReader } from '../../components/PaperReader';
import { ResearchInterface } from '../../components/ResearchInterface';
import type { NavKey } from '../../components/Sidebar';
import { TaskInterface } from '../../components/TaskInterface';
import { graphEdges, graphNodes } from '../../data/demoResearch';
import { useLayout } from '../../design/layout';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';
import { AskCard } from './AskCard';
import { NoteCard } from './NoteCard';
import { useWin } from './Window';

type Tile = { col: number; row: number; label: string; active: NavKey; render: (narrow: boolean, w: number, h: number) => React.ReactNode };

const graphTile = (w: number, h: number) => {
  const nodes: GNode[] = graphNodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, x: (n.b[0] / 100) * w, y: (n.b[1] / 100) * h, appear: 1, selected: n.id === 'rq' ? 1 : 0, near: 1 }));
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges: GEdge[] = graphEdges.flatMap(([a, b]) => {
    const A = by[a];
    const B = by[b];
    return A && B ? [{ x1: A.x, y1: A.y, x2: B.x, y2: B.y, draw: 1, active: a === 'rq' || b === 'rq' ? 1 : 0 }] : [];
  });
  return (
    <div style={{ position: 'relative', flex: 1, margin: 20, borderRadius: 16, border: `1px solid ${color.bd2}`, backgroundColor: color.card, backgroundImage: `radial-gradient(circle, ${color.bd} 1px, transparent 1.3px)`, backgroundSize: '22px 22px', overflow: 'hidden' }}>
      <KnowledgeGraph nodes={nodes} edges={edges} width={w - 40} height={h - 120} scale={1} />
    </div>
  );
};

const centred = (child: React.ReactNode) => (
  <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>{child}</div>
);

/** The eight modules around Home (centre tile = the live window). */
export const TILES: Tile[] = [
  { col: -1, row: -1, label: 'Research', active: 'research', render: (n) => <ResearchInterface narrow={n} s={{ typed: 1, caret: false, press: 0, loading: 0, results: 1, focus: 0, expand: 0, scroll: 0 }} /> },
  { col: 0, row: -1, label: 'Reader', active: 'reader', render: (n) => <PaperReader narrow={n} s={{ select: 1, annotate: 1, menu: 0, askPress: 0, scroll: 0 }} /> },
  {
    col: 1,
    row: -1,
    label: 'Ask Atlas',
    active: 'none',
    render: () => centred(<AskCard width={560} s={{ card: 1, quoteIn: 1, ask: 1, think: 1, answer: 1, verified: 1, save: 0 }} />),
  },
  {
    col: -1,
    row: 0,
    label: 'Semantic Map',
    active: 'map',
    render: (_n, w, h) => (
      <div style={{ position: 'relative', flex: 1 }}>
        <div style={{ position: 'absolute', left: 40, top: 30, width: w - 80, height: h - 100 }}>
          <SemanticField width={w - 80} height={h - 100} reveal={1} portrait={false} />
        </div>
      </div>
    ),
  },
  { col: 1, row: 0, label: 'Knowledge graph', active: 'graph', render: (_n, w, h) => graphTile(w, h) },
  { col: -1, row: 1, label: 'Notes', active: 'none', render: () => centred(<NoteCard width={520} />) },
  { col: 0, row: 1, label: 'Tasks', active: 'tasks', render: (n, w, h) => <TaskInterface s={{ settle: 1, board: 1, panel: 0, assign: 1, comment: 0, link: 0, status: 0 }} narrow={n} paneW={w} paneH={h} /> },
  { col: 1, row: 1, label: 'Manuscript', active: 'manuscript', render: (n) => <ManuscriptInterface narrow={n} s={{ fly: 0, insert: 1, compile: 1, preview: 1 }} /> },
];

/**
 * Breadth beat: the Home window is revealed as one tile in a 3×3 grid of
 * real Atlas modules. Tiles live in the window's layer, so the rig's
 * pull-back and dive move them as one surface.
 */
export const Mosaic: React.FC<{ reveal: (i: number) => number; gap?: number }> = ({ reveal, gap = 90 }) => {
  const w = useWin();
  const { portrait } = useLayout();
  const tw = w.width * w.zoom;
  const th = w.height * w.zoom;
  const paneW = portrait ? w.width : w.width - 241;
  return (
    <>
      {TILES.map((t, i) => {
        const r = reveal(i);
        if (r <= 0.001) return null;
        return (
          <div
            key={t.label}
            style={{
              position: 'absolute',
              left: w.left + t.col * (tw + gap),
              top: w.top + t.row * (th + gap),
              width: tw,
              height: th,
              opacity: r,
              transform: `translateY(${(1 - r) * 120}px)`,
            }}
          >
            <div style={{ width: w.width, height: w.height, transform: w.zoom !== 1 ? `scale(${w.zoom})` : undefined, transformOrigin: '0 0' }}>
              <AtlasWorkspace width={w.width} height={w.height} active={t.active} sidebar={!portrait}>
                {t.render(portrait, paneW, w.height)}
              </AtlasWorkspace>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: th + 18,
                textAlign: 'center',
                fontFamily: font.mono,
                fontSize: portrait ? 64 : 52,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: color.tx2,
              }}
            >
              {t.label}
            </div>
          </div>
        );
      })}
    </>
  );
};
