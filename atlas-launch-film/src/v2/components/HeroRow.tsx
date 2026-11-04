import { BookOpen, Bookmark, Quote } from 'lucide-react';
import React from 'react';
import { Icon } from '../../components/Icon';
import { papers } from '../../data/demoResearch';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';

/** The focused search result (same markup as ResearchInterface rows), lifted out as a hero object. */
export const HeroRow: React.FC<{ width: number; open?: number; style?: React.CSSProperties }> = ({ width, open = 0, style }) => {
  const p = papers[0];
  if (!p) return null;
  return (
    <div
      style={{
        width,
        display: 'flex',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        background: color.hov,
        boxShadow: 'inset 0 0 0 1px rgba(91,141,239,.45)',
        fontFamily: font.sans,
        color: color.tx,
        ...style,
      }}
    >
      <span style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, borderRadius: 4, border: `1.5px solid ${color.tx3}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, lineHeight: 1.35, fontWeight: 600, letterSpacing: '-.01em' }}>{p.title}</div>
        <div style={{ fontSize: 12.5, color: color.tx3, margin: '3px 0 6px' }}>
          {p.authors} · {p.venue} · Cited by {p.cited}
        </div>
        <div style={{ fontSize: 13, color: color.tx2, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {p.abstract}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 11.5 }}>
          <span style={{ color: color.tx3 }}>[1]</span>
          <span style={{ padding: '2px 8px', borderRadius: 999, background: color.el, color: color.tx2 }}>{p.relevance}</span>
          <span style={{ padding: '2px 8px', borderRadius: 999, background: color.el, color: color.tx2 }}>Open access</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
        {[Bookmark, Quote, BookOpen].map((I, k) => (
          <span
            key={k}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: k === 2 ? `rgba(58,58,55,${open})` : 'transparent',
              boxShadow: k === 2 && open > 0 ? `0 0 0 1px rgba(91,141,239,${0.6 * open})` : undefined,
            }}
          >
            <Icon icon={I} size={15} tint={k === 2 && open > 0.3 ? color.tx : color.tx3} />
          </span>
        ))}
      </div>
    </div>
  );
};
