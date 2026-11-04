import React from 'react';
import { color, shadow } from '../design/tokens';
import { font } from '../design/typography';
import { Sidebar, type NavKey } from './Sidebar';

type Props = {
  width: number;
  height: number;
  active: NavKey;
  sidebar?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * The Atlas application frame: --sb shell, 240px sidebar and a --bg main pane
 * with a hairline left border — the reference root layout, presented as a
 * floating product window.
 */
export const AtlasWorkspace: React.FC<Props> = ({ width, height, active, sidebar = true, children, style }) => (
  <div
    style={{
      width,
      height,
      display: 'flex',
      borderRadius: 14,
      overflow: 'hidden',
      background: color.sb,
      color: color.tx,
      fontFamily: font.sans,
      fontSize: 14,
      lineHeight: 1.5,
      letterSpacing: '-.006em',
      boxShadow: shadow.window,
      WebkitFontSmoothing: 'antialiased',
      ...style,
    }}
  >
    {sidebar ? <Sidebar active={active} /> : null}
    <main
      style={{
        flex: 1,
        minWidth: 0,
        background: color.bg,
        borderLeft: sidebar ? `1px solid ${color.bd2}` : undefined,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </main>
  </div>
);
