'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/features/shell/use-media';
import {
  Building2,
  Check,
  CircleArrowUp,
  CreditCard,
  Palette,
  User,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn } from '@/components/atlas/button';
import { Avatar } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { UsageMeter } from '@/features/overlays/pricing-dialog';
import {
  settingsSections,
  type SettingsSection,
} from '@/features/shell/navigation';
import { useShell } from '@/features/shell/shell-context';
import { Crumb, Topbar } from '@/features/shell/topbar';
import {
  currentUser,
  people,
  sampleWorkspace,
  workspaceMembers,
} from '@/lib/preview/people';
const icons = {
  profile: User,
  appearance: Palette,
  workspace: Building2,
  plan: CreditCard,
} as const;
const themeCards = [
  {
    key: 'dark',
    label: 'Dark',
    sb: '#171817',
    bg: '#232423',
    line: '#4a4d4a',
    line2: '#363936',
  },
  {
    key: 'light',
    label: 'Light',
    sb: '#f2f1eb',
    bg: '#fffdf9',
    line: '#cfccc2',
    line2: '#e6e4dc',
  },
  {
    key: 'system',
    label: 'System',
    sb: 'linear-gradient(90deg,#171817 50%,#f2f1eb 50%)',
    bg: 'linear-gradient(90deg,#232423 50%,#fffdf9 50%)',
    line: '#8a8d86',
    line2: '#9a9c95',
  },
] as const;
/** Settings (prototype "settings"): profile, appearance, workspace, plan. */
export function SettingsScreen({ section }: { section: SettingsSection }) {
  const { theme: storedTheme, setTheme } = useTheme();
  const theme = useHydrated() ? storedTheme : undefined;
  const shell = useShell();
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb title="Settings" as="span" />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[880px] flex-wrap gap-9 px-8 pt-10 pb-20 max-sm:px-4">
          <nav
            aria-label="Settings sections"
            className="flex w-[170px] flex-col gap-px max-sm:w-full"
          >
            <h1 className="mb-3.5 font-serif text-[30px] leading-none font-medium">
              Settings
            </h1>
            {settingsSections.map((s) => {
              const Icon = icons[s.slug];
              const active = s.slug === section;
              return (
                <Link
                  key={s.slug}
                  href={`/app/settings/${s.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-[30px] items-center gap-[9px] rounded-md px-2 hover:bg-hov',
                    active ? 'bg-hov text-tx' : 'text-tx2',
                  )}
                >
                  <Icon aria-hidden="true" className="size-[14px]" />
                  {s.label}
                </Link>
              );
            })}
          </nav>
          <div className="min-w-[300px] flex-1 pt-11 max-sm:min-w-0 max-sm:pt-0">
            {section === 'profile' ? (
              <section aria-labelledby="s-profile">
                <h2 id="s-profile" className="mb-1 text-[15px] font-semibold">
                  Profile
                </h2>
                <p className="mb-4 text-ctl text-tx3">
                  Sample profile · account editing arrives with Phase 01
                  identity.
                </p>
                <div className="mb-4 flex items-center gap-3">
                  <Avatar person={currentUser} size={40} />
                  <div className="text-ui font-medium">{currentUser.name}</div>
                </div>
                <div className="flex max-w-[420px] flex-col gap-3.5">
                  {[
                    ['Name', currentUser.name],
                    ['Email', currentUser.email],
                    ['Affiliation', 'Kaya Lab'],
                    ['ORCID', 'Not connected'],
                  ].map(([label, value]) => (
                    <label
                      key={label}
                      className="flex flex-col gap-[5px] text-xs text-tx2"
                    >
                      {label}
                      <input
                        value={value}
                        readOnly
                        className="h-[34px] rounded-[7px] border border-bd bg-canvas px-2.5 text-ui text-tx"
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
            {section === 'appearance' ? (
              <section aria-labelledby="s-appearance">
                <h2
                  id="s-appearance"
                  className="mb-1 text-[15px] font-semibold"
                >
                  Appearance
                </h2>
                <p className="mb-4 text-ctl text-tx3">
                  Atlas is designed dark-first. Light uses warm ivory paper
                  tones.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Theme"
                  className="mb-6 flex flex-wrap gap-3"
                >
                  {themeCards.map((t) => {
                    const selected = (theme ?? 'dark') === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setTheme(t.key)}
                        className={cn(
                          'w-[186px] rounded-xl p-2 text-left max-sm:w-full',
                          selected
                            ? 'border-[1.5px] border-ac'
                            : 'border border-bd',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-24 gap-1.5 rounded-md p-1.5"
                          style={{ background: t.sb }}
                        >
                          <span className="flex w-[34%] flex-col gap-1 pt-1">
                            {[70, 50, 60].map((w) => (
                              <span
                                key={w}
                                className="h-1 rounded-[2px]"
                                style={{ width: `${w}%`, background: t.line }}
                              />
                            ))}
                          </span>
                          <span
                            className="flex flex-1 flex-col gap-1 rounded-xs p-2"
                            style={{ background: t.bg }}
                          >
                            <span
                              className="h-1.5 w-[60%] rounded-[2px]"
                              style={{ background: t.line }}
                            />
                            <span
                              className="h-[3px] w-[90%] rounded-[2px]"
                              style={{ background: t.line2 }}
                            />
                            <span
                              className="h-[3px] w-[80%] rounded-[2px]"
                              style={{ background: t.line2 }}
                            />
                            <span className="mt-auto h-2 w-[40%] rounded-[2px] bg-[#329a53]" />
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 px-0.5 pt-2 text-ctl">
                          <span className="flex-1">{t.label}</span>
                          {selected ? (
                            <Check
                              aria-hidden="true"
                              className="size-[13px] text-actx"
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col border-t border-bd2">
                  <div className="flex items-center gap-2.5 border-b border-bd2 py-3">
                    <div className="flex-1">
                      <div className="font-medium">Writing font</div>
                      <div className="text-xs text-tx3">
                        Used in documents and notes
                      </div>
                    </div>
                    <span className="rounded-md border border-bd px-2.5 py-1 font-read text-ui">
                      Lora
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 border-b border-bd2 py-3">
                    <div className="flex-1">
                      <div className="font-medium">Interface density</div>
                      <div className="text-xs text-tx3">
                        Compact is the default for long sessions · preview only
                      </div>
                    </div>
                    <Segmented
                      label="Interface density"
                      size="sm"
                      variant="solid"
                      value={density}
                      onChange={setDensity}
                      options={[
                        { value: 'compact', label: 'Compact' },
                        { value: 'comfortable', label: 'Comfortable' },
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2.5 border-b border-bd2 py-3">
                    <div className="flex-1">
                      <div className="font-medium">Atlas opens as</div>
                      <div className="text-xs text-tx3">
                        Default AI surface when you press ⌘J
                      </div>
                    </div>
                    <span className="rounded-md border border-bd px-2.5 py-1 text-ctl">
                      Floating, focused
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] text-tx3">
                  Only the theme and sidebar preference are saved in this
                  browser.
                </p>
              </section>
            ) : null}
            {section === 'workspace' ? (
              <section aria-labelledby="s-workspace">
                <h2 id="s-workspace" className="mb-1 text-[15px] font-semibold">
                  {sampleWorkspace.name}
                </h2>
                <p className="mb-4 text-ctl text-tx3">
                  {sampleWorkspace.members} members · {sampleWorkspace.kind} ·
                  sample membership, not live access control
                </p>
                <ul className="border-t border-bd2">
                  {workspaceMembers.map((m) => {
                    const p = people[m.id];
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-2.5 border-b border-bd2 py-2.5"
                      >
                        <Avatar person={p} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="text-ui font-medium">{p.name}</div>
                          <div className="truncate text-[11.5px] text-tx3">
                            {p.email}
                          </div>
                        </div>
                        <span className="text-xs text-tx2">{m.role}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {section === 'plan' ? (
              <section aria-labelledby="s-plan">
                <h2 id="s-plan" className="mb-1 text-[15px] font-semibold">
                  Plan &amp; usage
                </h2>
                <p className="mb-4 text-ctl text-tx3">
                  You’re on Free. Usage below is sample data; billing is not
                  connected.
                </p>
                <div className="mb-5 flex max-w-[440px] flex-col gap-3.5">
                  <UsageMeter label="Atlas requests" value={42} max={50} />
                  <UsageMeter
                    label="Storage"
                    value={1.2}
                    max={2}
                    unit=" GB"
                    tone="muted"
                  />
                </div>
                <Btn
                  variant="primary"
                  size="xl"
                  onClick={() => shell.setPricingOpen(true)}
                >
                  <CircleArrowUp aria-hidden="true" className="!size-[14px]" />
                  Compare plans
                </Btn>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
