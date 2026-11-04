import React from 'react';
import { font } from '../../design/typography';

/** Collaborator cursor with name tag (presence language from the reference editor). */
export const Cursor: React.FC<{ x: number; y: number; name: string; tint: string; press?: number; scale?: number; opacity?: number }> = ({
  x,
  y,
  name,
  tint,
  press = 0,
  scale = 1,
  opacity = 1,
}) => (
  <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${scale * (1 - 0.12 * Math.sin(Math.PI * Math.min(1, press)))})`, transformOrigin: '0 0', opacity }}>
    <svg width={22} height={26} viewBox="0 0 22 26" style={{ display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.5))' }}>
      <path d="M2 2 L2 21 L7.2 16.4 L10.8 24 L14 22.6 L10.5 15.2 L17.5 15.2 Z" fill={tint} stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
    <span
      style={{
        position: 'absolute',
        left: 16,
        top: 22,
        padding: '3px 8px',
        borderRadius: 6,
        background: tint,
        color: '#fff',
        fontFamily: font.sans,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  </div>
);
