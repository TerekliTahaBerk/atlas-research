import {
  ChevronDown,
  FileCode,
  FileText,
  FlaskConical,
  Hash,
  House,
  Inbox,
  LayoutDashboard,
  Library,
  ListTodo,
  Map,
  MessageCircle,
  PanelLeft,
  Search,
  SquarePen,
  Telescope,
  Waypoints,
  File,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import { people, workspace } from '../data/demoResearch';
import { color } from '../design/tokens';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export type NavKey =
  | 'home'
  | 'overview'
  | 'map'
  | 'manuscript'
  | 'tasks'
  | 'channels'
  | 'experiments'
  | 'graph'
  | 'research'
  | 'library'
  | 'reader'
  | 'none';

const Row: React.FC<{
  icon: LucideIcon;
  label: string;
  active?: boolean;
  trailing?: React.ReactNode;
  iconTint?: string;
  muted?: boolean;
}> = ({ icon, label, active, trailing, iconTint, muted }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 32,
      padding: '0 8px',
      borderRadius: 8,
      fontSize: muted ? 13 : 14,
      background: active ? color.hov : 'transparent',
      color: active ? color.tx : muted ? color.tx3 : color.tx2,
    }}
  >
    <Icon icon={icon} size={16} tint={iconTint ?? (active ? color.tx : muted ? color.tx3 : color.tx2)} />
    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    {trailing}
  </div>
);

const Section: React.FC<{ label: string; trailing?: React.ReactNode }> = ({ label, trailing }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: 30, padding: '0 8px', marginTop: 14, fontSize: 13.5, color: color.tx3 }}>
    <Icon icon={ChevronDown} size={15} tint={color.tx3} style={{ marginRight: 8 }} />
    <span style={{ flex: 1 }}>{label}</span>
    {trailing}
  </div>
);

/** Sidebar reconstructed from the reference `<aside>` (240px, --sb). */
export const Sidebar: React.FC<{ active: NavKey }> = ({ active }) => (
  <aside
    style={{
      width: 240,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 10px 10px',
      background: color.sb,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 12 }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 8px' }}>
        <span style={{ fontWeight: 600, fontSize: 15.5, letterSpacing: '-.015em' }}>{workspace.project}</span>
        <Icon icon={ChevronDown} size={13} tint={color.tx3} />
      </div>
      <div style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }}>
        <Icon icon={PanelLeft} size={17} />
      </div>
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
      <Row icon={SquarePen} label="New" />
      <Row icon={Search} label="Search" trailing={<span style={{ fontSize: 11.5, color: color.tx3 }}>⌘K</span>} />
      <Row icon={House} label="Home" active={active === 'home'} />
      <Row
        icon={Inbox}
        label="Inbox"
        trailing={
          <span
            style={{
              fontSize: 11,
              minWidth: 20,
              height: 18,
              padding: '0 6px',
              borderRadius: 9,
              background: color.acs,
              color: color.actx,
              display: 'grid',
              placeItems: 'center',
              fontWeight: 600,
            }}
          >
            2
          </span>
        }
      />
      <Section label="Project" />
      <Row icon={LayoutDashboard} label="Overview" active={active === 'overview'} />
      <Row icon={Map} label="Semantic Map" active={active === 'map'} />
      <Row icon={FileCode} label="Manuscript" active={active === 'manuscript'} />
      <Row icon={ListTodo} label="Tasks" active={active === 'tasks'} trailing={<span style={{ fontSize: 12, color: color.tx3 }}>3</span>} />
      <Row
        icon={Hash}
        label="Channels"
        active={active === 'channels'}
        trailing={<span style={{ width: 6, height: 6, borderRadius: '50%', background: color.ac }} />}
      />
      <Row icon={FlaskConical} label="Experiments" active={active === 'experiments'} />
      <Row icon={Waypoints} label="Knowledge graph" active={active === 'graph'} />
      <Section label="Notes" />
      <Row icon={FileText} label="Related work — sparse attention" iconTint={color.tx3} />
      <Row icon={FileText} label="Reading notes — low-rank pairs" iconTint={color.tx3} />
      <Section label="Sources" trailing={<span style={{ fontSize: 12, color: color.tx3 }}>128</span>} />
      <Row icon={File} label="Chen & Duarte, 2023" iconTint="#E0524A" active={active === 'reader'} />
      <Row icon={File} label="Okafor et al., 2024" iconTint="#E0524A" />
      <Row icon={Library} label="Library" muted active={active === 'library'} />
      <Row icon={Telescope} label="Find new papers" muted active={active === 'research'} />
      <Section label="Chats" />
      <Row icon={MessageCircle} label="Memory at long lengths" iconTint={color.tx3} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 6px', marginTop: 6 }}>
      <Avatar person={people.elif} size={32} />
      <span style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{people.elif.first}</span>
    </div>
  </aside>
);
