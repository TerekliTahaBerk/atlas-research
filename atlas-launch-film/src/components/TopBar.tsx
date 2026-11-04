import { Bell, Plus, X, type LucideIcon } from 'lucide-react';
import React from 'react';
import { color } from '../design/tokens';
import { Icon } from './Icon';

/** The 48px tab bar that tops every reference view. */
export const TopBar: React.FC<{
  tab: string;
  tabIcon: LucideIcon;
  right?: React.ReactNode;
  border?: boolean;
}> = ({ tab, tabIcon, right, border }) => (
  <div
    style={{
      height: 48,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      position: 'relative',
      zIndex: 3,
      background: color.bg,
      borderBottom: border ? `1px solid ${color.bd2}` : undefined,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 8px 0 10px',
        borderRight: `1px solid ${color.bd2}`,
        color: color.tx,
      }}
    >
      <Icon icon={tabIcon} size={15} tint={color.tx} />
      <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{tab}</span>
      <Icon icon={X} size={12} tint={color.tx3} style={{ marginLeft: 4 }} />
    </div>
    <div style={{ width: 30, height: 30, display: 'grid', placeItems: 'center' }}>
      <Icon icon={Plus} size={16} />
    </div>
    <div style={{ flex: 1 }} />
    {right ?? <Icon icon={Bell} size={15} />}
  </div>
);
