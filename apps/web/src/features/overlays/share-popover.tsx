'use client';
import { useId, useState, type ReactNode } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Globe,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  Pencil,
  UserCheck,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn } from '@/components/atlas/button';
import { Avatar } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { people } from '@/lib/preview/people';
const access = {
  private: {
    label: 'Private',
    icon: Lock,
    description: 'Only people added above can open',
    note: 'The link only works for people with access.',
  },
  workspace: {
    label: 'Kaya Lab workspace',
    icon: Building2,
    description: 'Anyone in Kaya Lab can view',
    note: 'Workspace members can open the link. It is not public.',
  },
  invited: {
    label: 'Invited collaborators',
    icon: UserCheck,
    description: 'Invited guests outside Kaya Lab can view',
    note: 'Only invited guests and members can open the link.',
  },
} as const;
type Access = keyof typeof access;
const roles = [
  { key: 'Editor', icon: Pencil, sub: 'Can edit and share' },
  { key: 'Commenter', icon: MessageSquare, sub: 'Can comment only' },
  { key: 'Viewer', icon: Eye, sub: 'Can read only' },
] as const;
const members = [
  { id: 'taha', role: 'Owner' },
  { id: 'ayse', role: 'Editor' },
  { id: 'mehmet', role: 'Viewer' },
] as const;
/**
 * Share / Publish popover (handoff `SharePopover`, 380px). Copying a link
 * never changes access; invitations and publishing are not connected.
 */
export function SharePopover({
  resource,
  trigger,
  open,
  onOpenChange,
}: {
  resource: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const flash = useToast();
  const [tab, setTab] = useState<'share' | 'publish'>('share');
  const [level, setLevel] = useState<Access>('private');
  const [levelOpen, setLevelOpen] = useState(false);
  const [role, setRole] = useState<(typeof roles)[number]['key']>('Editor');
  const [emails, setEmails] = useState('');
  const [citations, setCitations] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const inviteId = useId();
  const current = access[level];
  const CurrentIcon = current.icon;
  return (
    <Popover
      {...(open !== undefined ? { open } : {})}
      onOpenChange={(next) => {
        if (!next) setLevelOpen(false);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <Btn variant="primary" className="px-3">
            Share
          </Btn>
        )}
      </PopoverTrigger>
      <PopoverContent
        width={380}
        align="end"
        aria-label={`Share ${resource}`}
        className="p-3"
      >
        <Segmented
          label="Share or publish"
          variant="solid"
          value={tab}
          onChange={setTab}
          className="mb-3"
          options={[
            { value: 'share', label: 'Share' },
            { value: 'publish', label: 'Publish' },
          ]}
        />
        {tab === 'share' ? (
          <>
            <div className="mb-3 flex gap-1.5">
              <label htmlFor={inviteId} className="sr-only">
                Invite people by email
              </label>
              <input
                id={inviteId}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="Add people by email, comma-separated"
                className="h-8 min-w-0 flex-1 rounded-[7px] border border-bd bg-canvas px-2.5 text-ctl"
              />
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Invite role: ${role}`}
                    className="flex h-8 items-center gap-1 rounded-[7px] border border-bd px-2 text-ctl text-tx2 hover:bg-hov"
                  >
                    {role}
                    <ChevronDown aria-hidden="true" className="size-3" />
                  </button>
                </MenuTrigger>
                <MenuContent width={180} align="end">
                  {roles.map((r) => (
                    <MenuItem
                      key={r.key}
                      icon={<r.icon />}
                      sub={r.sub}
                      checked={role === r.key}
                      onSelect={() => setRole(r.key)}
                    >
                      {r.key}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Btn
                variant="primary"
                className="h-8 rounded-[7px] px-3"
                onClick={() => {
                  flash(
                    'Invitation drafted — sending is not connected, nobody was invited',
                  );
                  setEmails('');
                }}
              >
                Invite
              </Btn>
            </div>
            <div className="mb-1 text-[11.5px] text-tx3">
              People with access
            </div>
            <ul>
              {members.map((m) => {
                const p = people[m.id];
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-2.5 px-0.5 py-[7px]"
                  >
                    <Avatar person={p} size={28} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-ctl font-medium">{p.name}</span>
                      <span className="truncate text-[11.5px] text-tx3">
                        {p.email}
                      </span>
                    </span>
                    {m.role === 'Owner' ? (
                      <span className="rounded-sm bg-acs px-2 py-0.5 text-[11.5px] font-medium text-actx">
                        Owner
                      </span>
                    ) : (
                      <span className="flex items-center gap-[3px] px-1.5 py-0.5 text-xs text-tx2">
                        {m.role}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2.5 mb-1.5 text-[11.5px] text-tx3">
              General access
            </div>
            <button
              type="button"
              aria-expanded={levelOpen}
              onClick={() => setLevelOpen((o) => !o)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-bd2 bg-card px-2.5 py-[9px] text-left hover:border-bd"
            >
              <span className="grid size-[30px] place-items-center rounded-[7px] bg-el text-tx2">
                <CurrentIcon aria-hidden="true" className="size-[14px]" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-ui font-medium">{current.label}</span>
                <span className="text-[11.5px] text-tx3">
                  {current.description}
                </span>
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="size-[13px] text-tx3"
              />
            </button>
            {levelOpen ? (
              <div
                role="radiogroup"
                aria-label="General access"
                className="mt-1 animate-atlas-in rounded-lg border border-bd bg-pop p-1"
              >
                {(Object.keys(access) as Access[]).map((k) => {
                  const o = access[k];
                  const Icon = o.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={level === k}
                      onClick={() => {
                        setLevel(k);
                        setLevelOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-left hover:bg-hov"
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[14px] text-tx2"
                      />
                      <span className="flex flex-1 flex-col">
                        <span className="text-ctl">{o.label}</span>
                        <span className="text-[11px] text-tx3">
                          {o.description}
                        </span>
                      </span>
                      {level === k ? (
                        <Check
                          aria-hidden="true"
                          className="size-[14px] text-actx"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <Btn
              variant="primary"
              className="mt-3 h-9 w-full rounded-lg text-ui"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(window.location.href)
                  .catch(() => {});
                flash(
                  `Link copied. Access is unchanged: ${current.label}`,
                  'done',
                );
              }}
            >
              <LinkIcon aria-hidden="true" className="!size-[14px]" />
              Copy link
            </Btn>
            <p className="mt-[7px] text-center text-[11px] text-tx3">
              {current.note}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 px-2 pt-3.5 pb-1.5 text-center">
              <span className="grid size-10 place-items-center rounded-xl bg-el text-tx2">
                <Globe aria-hidden="true" className="size-[18px]" />
              </span>
              <span className="font-medium">Publish to the web</span>
              <span className="max-w-[280px] text-xs text-tx3">
                Creates a public, read-only copy anyone can open. Comments,
                tasks and linked private papers are not included.
              </span>
            </div>
            <div className="my-2.5 flex flex-col gap-1.5">
              {(
                [
                  [
                    'Include citations and bibliography',
                    citations,
                    setCitations,
                  ],
                  ['Allow search engines to index', indexing, setIndexing],
                ] as const
              ).map(([label, value, set]) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center gap-2 text-ctl text-tx2"
                >
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className={cn('size-3.5 accent-[var(--acb)]')}
                  />
                  {label}
                </label>
              ))}
            </div>
            <Btn
              variant="outline"
              className="h-9 w-full rounded-lg text-ui font-medium"
              onClick={() =>
                flash('Publishing isn’t connected — nothing was published')
              }
            >
              Publish public copy
            </Btn>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
