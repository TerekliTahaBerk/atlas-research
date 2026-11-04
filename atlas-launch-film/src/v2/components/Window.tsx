import React from 'react';
import { AtlasWorkspace } from '../../components/AtlasWorkspace';
import type { NavKey } from '../../components/Sidebar';
import { useLayout } from '../../design/layout';

/**
 * V2 window geometry. Landscape: a 1600×1000 workspace centred on the stage.
 * Portrait: the reference's narrow layout (620×940) magnified for phones.
 */
export const WIN = {
  landscape: { left: 160, top: 40, width: 1600, height: 1000, zoom: 1, pane: 241 },
  portrait: { left: 70, top: 400, width: 620, height: 940, zoom: 940 / 620, pane: 0 },
} as const;

export const useWin = () => {
  const { portrait } = useLayout();
  return portrait ? WIN.portrait : WIN.landscape;
};

/** Window-space point → screen position at camera rest. */
export const winToScreen = (w: (typeof WIN)['landscape'] | (typeof WIN)['portrait'], p: [number, number]): [number, number] => [
  w.left + p[0] * w.zoom,
  w.top + p[1] * w.zoom,
];

export const Window: React.FC<{
  active: NavKey;
  children: React.ReactNode;
  /** Extra transform on the window element (e.g. hinge). */
  hinge?: string;
  overlay?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ active, children, hinge, overlay, style }) => {
  const w = useWin();
  const { portrait } = useLayout();
  return (
    <div
      style={{
        position: 'absolute',
        left: w.left,
        top: w.top,
        width: w.width * w.zoom,
        height: w.height * w.zoom,
        transformOrigin: '50% 0%',
        transform: hinge,
        ...style,
      }}
    >
      <div style={{ width: w.width, height: w.height, transform: w.zoom !== 1 ? `scale(${w.zoom})` : undefined, transformOrigin: '0 0' }}>
        <AtlasWorkspace width={w.width} height={w.height} active={active} sidebar={!portrait}>
          {children}
        </AtlasWorkspace>
        {overlay}
      </div>
    </div>
  );
};
