import { BookOpen, FileCode, FileText, FolderKanban, House, LayoutGrid, List, ChevronDown, FlaskConical } from 'lucide-react';
import React from 'react';
import { people, workspace } from '../data/demoResearch';
import { color } from '../design/tokens';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { TopBar } from './TopBar';

const cont = [
  { ic: FileCode, t: 'main.tex', m: 'Manuscript · edited 12 min ago' },
  { ic: FileText, t: 'Reading notes — low-rank pairs', m: 'Note · yesterday' },
  { ic: BookOpen, t: 'Chen & Duarte, 2023', m: 'Paper · page 3 of 14' },
  { ic: FlaskConical, t: 'run_14 sweep', m: 'Notebook · ran 3h ago' },
];

const projects = [
  { t: workspace.project, d: 'Learned block sparsity for memory-efficient structure prediction', c: '14 papers · 6 docs · 9 tasks', p: [people.elif, people.nora, people.mehmet] },
  { t: 'Contact Map Benchmark', d: 'A shared harness for long-range contact precision', c: '31 papers · 3 docs · 4 tasks', p: [people.mehmet, people.elif] },
  { t: 'Thesis', d: 'Efficient attention for biological sequences', c: '52 papers · 11 docs · 6 tasks', p: [people.elif] },
];

/** Home view (reference `is.home`). */
export const HomeView: React.FC<{ narrow?: boolean }> = ({ narrow }) => (
  <>
    <TopBar tab="Home" tabIcon={House} />
    <div style={{ padding: narrow ? '24px 24px' : '32px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 30.5, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.1, marginBottom: 18 }}>
        Good afternoon, {people.elif.first}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: color.el, border: `1px solid ${color.bd2}` }}>
          {['Recent', 'Shared', 'Starred'].map((t, i) => (
            <span
              key={t}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                fontSize: 12.5,
                display: 'grid',
                placeItems: 'center',
                background: i === 0 ? color.hov : 'transparent',
                color: i === 0 ? color.tx : color.tx2,
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {narrow ? null : (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <span style={{ color: color.tx3 }}>Sort</span>
              <span>Last edited</span>
              <Icon icon={ChevronDown} size={12} />
            </span>
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: color.el, border: `1px solid ${color.bd2}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 6, fontSize: 12.5, background: color.hov }}>
                <Icon icon={LayoutGrid} size={13} tint={color.tx} />
                Grid
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', fontSize: 12.5, color: color.tx2 }}>
                <Icon icon={List} size={13} />
                List
              </span>
            </div>
          </>
        )}
      </div>
      <div style={{ fontSize: 12, color: color.tx3, marginBottom: 10 }}>Continue working</div>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 36 }}>
        {cont.map((c) => (
          <div
            key={c.t}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${color.bd2}`, background: color.card, minWidth: 0 }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 8, background: color.el, border: `1px solid ${color.bd2}`, display: 'grid', placeItems: 'center' }}>
              <Icon icon={c.ic} size={15} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.t}</span>
              <span style={{ fontSize: 11.5, color: color.tx3, whiteSpace: 'nowrap' }}>{c.m}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: color.tx3, marginBottom: 10 }}>Projects</div>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        {projects.map((p) => (
          <div key={p.t} style={{ padding: '16px 18px', borderRadius: 12, border: `1px solid ${color.bd2}`, background: color.card, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon icon={FolderKanban} size={15} />
              <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.015em' }}>{p.t}</span>
            </div>
            <div style={{ fontSize: 13, color: color.tx2, lineHeight: 1.55 }}>{p.d}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ display: 'flex' }}>
                {p.p.map((x, i) => (
                  <Avatar key={x.initials} person={x} size={22} ring={color.card} style={{ marginLeft: i === 0 ? 0 : -5 }} />
                ))}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: color.tx3 }}>{p.c}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
);
