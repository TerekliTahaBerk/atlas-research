import { BookOpen, FileText } from 'lucide-react';
import React from 'react';
import { Icon } from '../../components/Icon';
import { insight, people } from '../../data/demoResearch';
import { color, kind } from '../../design/tokens';
import { font } from '../../design/typography';

/** Layout width of the note card (rendered magnified to the NOTE anchor). */
export const NOTE_W = 520;
/** On-screen height of the note at the anchor. */
export const NOTE_H = (portrait: boolean) => (portrait ? 520 : 350);

/** The saved research note — hero object from Understand into Connect. */
export const NoteCard: React.FC<{ width: number; style?: React.CSSProperties; glow?: number }> = ({ width, style, glow = 0 }) => (
  <div
    style={{
      width,
      padding: 18,
      borderRadius: 14,
      background: color.card,
      border: `1px solid ${color.bd}`,
      boxShadow: `0 30px 80px rgba(0,0,0,.55), 0 0 0 ${3 * glow}px rgba(91,141,239,${0.25 * glow})`,
      fontFamily: font.sans,
      color: color.tx,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.tx2, marginBottom: 10 }}>
      <Icon icon={FileText} size={14} tint={kind.doc} />
      <span style={{ flex: 1 }}>{insight.noteTitle}</span>
      <span style={{ fontSize: 11.5, color: color.tx3 }}>{people.elif.first} · now</span>
    </div>
    <div style={{ fontSize: 13.5, color: color.tx2, borderLeft: '2px solid rgba(201,164,72,.75)', paddingLeft: 10, marginBottom: 10, lineHeight: 1.45 }}>
      “peak memory … falls from 61 GB to 19 GB”
    </div>
    <div style={{ fontSize: 15, lineHeight: 1.55 }}>{insight.answer}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: color.tx3 }}>
      <Icon icon={BookOpen} size={12} tint={color.tx3} />
      {insight.source}
    </div>
  </div>
);
