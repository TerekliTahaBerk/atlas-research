import React from 'react';
import type { Person } from '../data/demoResearch';

export const Avatar: React.FC<{ person: Person; size?: number; ring?: string; style?: React.CSSProperties }> = ({
  person,
  size = 20,
  ring,
  style,
}) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: person.color,
      color: '#fff',
      fontSize: Math.max(7, size * 0.4),
      fontWeight: 600,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      letterSpacing: 0,
      ...style,
    }}
  >
    {person.initials}
  </span>
);
