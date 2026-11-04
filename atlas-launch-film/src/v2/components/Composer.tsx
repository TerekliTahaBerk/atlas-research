import { ArrowUp, Building2, Plus } from 'lucide-react';
import React from 'react';
import { Icon } from '../../components/Icon';
import { researchQuestion, workspace } from '../../data/demoResearch';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';

/** The Ask Atlas composer (reference `ai` input: + · input · scope chip · send). */
export const Composer: React.FC<{ width: number; typed?: number; caret?: boolean; press?: number; style?: React.CSSProperties }> = ({
  width,
  typed = 1,
  caret = false,
  press = 0,
  style,
}) => {
  const text = researchQuestion.slice(0, Math.round(researchQuestion.length * typed));
  return (
    <div
      style={{
        width,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px 0 6px',
        borderRadius: 18,
        background: '#2A2A2A',
        border: '1px solid #3A3A3A',
        boxShadow: '0 24px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03)',
        fontFamily: font.sans,
        color: color.tx,
        ...style,
      }}
    >
      <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center' }}>
        <Icon icon={Plus} size={17} tint={color.actx} />
      </span>
      <span style={{ flex: 1, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', color: text ? color.tx : color.tx3 }}>
        {text || 'Ask Atlas across Kaya Lab'}
        {caret ? <span style={{ display: 'inline-block', width: 1.5, height: 17, background: color.tx, verticalAlign: -3, marginLeft: 1 }} /> : null}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          borderRadius: 999,
          background: color.acs,
          color: color.actx,
          fontSize: 12.5,
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon icon={Building2} size={13} tint={color.actx} />
        {workspace.lab}
      </span>
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: press > 0 ? color.tx : color.hov,
          transform: `scale(${1 - 0.12 * Math.sin(Math.PI * Math.min(1, press))})`,
        }}
      >
        <Icon icon={ArrowUp} size={15} stroke={2} tint={press > 0 ? color.bg : color.tx2} />
      </span>
    </div>
  );
};
