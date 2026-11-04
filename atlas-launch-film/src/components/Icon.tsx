import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { color } from '../design/tokens';

type Props = {
  icon: LucideIcon;
  size?: number;
  tint?: string;
  stroke?: number;
  style?: React.CSSProperties;
};

/** Lucide icon (same set the reference loads via lucide-static), rendered as inline SVG. */
export const Icon: React.FC<Props> = ({ icon: I, size = 16, tint = color.tx2, stroke = 1.75, style }) => (
  <I size={size} color={tint} strokeWidth={stroke} style={{ flexShrink: 0, display: 'block', ...style }} />
);
