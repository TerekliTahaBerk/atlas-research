import React from 'react';
import { useLayout } from '../design/layout';
import { AtlasWorkspace } from './AtlasWorkspace';
import { Camera, type CameraKey } from './Camera';
import type { NavKey } from './Sidebar';

/** Window geometry at rest, per orientation. Shared so dissolves line up. */
export const windowRest = {
  landscape: { width: 1600, height: 1000, left: 160, top: 228, zoom: 1 },
  // Portrait renders a narrow 620px layout magnified for phone legibility.
  portrait: { width: 620, height: 940, left: 70, top: 540, zoom: 940 / 620 },
} as const;

export const useWindowRest = () => {
  const { portrait } = useLayout();
  return portrait ? windowRest.portrait : windowRest.landscape;
};

type Props = {
  keys: CameraKey[];
  active: NavKey;
  children: React.ReactNode;
  /** Optional overlay drawn in window space (above content, under camera). */
  overlay?: React.ReactNode;
  /** Override the camera origin (window-space percentages). */
  origin?: string;
  opacity?: number;
};

/**
 * The product presented on the stage: Atlas workspace at its rest pose, with
 * a camera anchored to the window's top edge (so pushes never climb into the
 * headline band). Portrait uses the narrow layout
 * from the reference (sidebar collapsed), so content is recomposed, not cropped.
 */
export const ProductShot: React.FC<Props> = ({ keys, active, children, overlay, origin, opacity = 1 }) => {
  const { portrait } = useLayout();
  const rest = portrait ? windowRest.portrait : windowRest.landscape;
  const ox = rest.left + (rest.width * rest.zoom) / 2;
  const oy = rest.top;
  return (
    <Camera keys={keys} origin={origin ?? `${ox}px ${oy}px`} style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          left: rest.left,
          top: rest.top,
          width: rest.width,
          height: rest.height,
          transform: rest.zoom !== 1 ? `scale(${rest.zoom})` : undefined,
          transformOrigin: '0 0',
        }}
      >
        <AtlasWorkspace width={rest.width} height={rest.height} active={active} sidebar={!portrait}>
          {children}
        </AtlasWorkspace>
        {overlay}
      </div>
    </Camera>
  );
};
