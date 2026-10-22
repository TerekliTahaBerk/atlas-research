'use client';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/features/shell/use-media';
import { ArrowUp, BookOpen, LoaderCircle, Plus, Sparkles } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, btnVariants } from '@/components/atlas/button';
import { RefChip, SampleTag, StatusTag } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { useShell } from '@/features/shell/shell-context';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { contrastAdjustments, contrastPairs, tokenTable } from './tokens';
const typeScale = [
  [
    'Display',
    'Cormorant 42/500',
    'font-serif text-[42px] font-medium',
    'Related work — sparse attention',
  ],
  [
    'Page title',
    'Cormorant 30–36/500',
    'font-serif text-[32px] font-medium',
    'Good afternoon, Taha',
  ],
  [
    'Section',
    'Cormorant 24/500',
    'font-serif text-2xl font-medium',
    'Documents & notes',
  ],
  [
    'Reading',
    'Lora 16.5/1.75',
    'font-read text-[16.5px]',
    'Pair representations are the dominant memory cost in structure prediction.',
  ],
  [
    'UI body',
    'Geist 13/400',
    'text-ui',
    'Sidebar items, menus, buttons and form controls',
  ],
  [
    'UI emphasis',
    'Geist 13/500–600',
    'text-ui font-semibold',
    'Inbox · Share · Version history',
  ],
  [
    'Meta',
    'Geist 11.5/400',
    'text-meta text-tx3',
    'Edited 12 min ago · 3 linked papers',
  ],
  [
    'Code',
    'JetBrains Mono 13/22',
    'font-mono text-ui',
    '\\begin{equation} \\mathcal{A} = … \\end{equation}',
  ],
] as const;
const radii = [
  ['control', '6px', 'rounded-md', false],
  ['input', '8px', 'rounded-lg', false],
  ['card', '12px', 'rounded-2xl', false],
  ['popover', '10–12px', 'rounded-xl', true],
  ['modal', '14–16px', 'rounded-3xl', true],
] as const;
const motion = [
  ['Popover / menu enter', '140ms ease-out', 'Fade + 4px drop + 0.985 scale'],
  [
    'AI compact → open',
    '280ms expand / 170ms collapse',
    'Panel grows from the composer; input stays fixed',
  ],
  [
    'AI → focus',
    '200ms fade',
    'Background dims to --dim with 7px blur; Esc returns',
  ],
  ['Hover', 'instant', 'Surface → --hov, text → --tx'],
  ['Loading', '1s pulse', 'Single green dot + specific status text'],
  [
    'Reduced motion',
    '—',
    'All animation collapses; sample AI sequences finish instantly',
  ],
] as const;
/** Design system QA view (prototype "system"); outside primary navigation. */
export function DesignSystemScreen() {
  const { resolvedTheme } = useTheme();
  const shell = useShell();
  const hydrated = useHydrated();
  const theme = hydrated && resolvedTheme === 'light' ? 'light' : 'dark';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <div className="flex flex-wrap items-center gap-2 max-md:hidden">
            <Link href="/login" className={btnVariants({ variant: 'outline' })}>
              Preview sign-in
            </Link>
            <Link
              href="/onboarding"
              className={btnVariants({ variant: 'outline' })}
            >
              Preview onboarding
            </Link>
            <Btn variant="outline" onClick={() => shell.setPricingOpen(true)}>
              Pricing
            </Btn>
          </div>
        }
      >
        <Crumb title="Design system" as="span" />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1080px] px-8 pt-10 pb-[100px] max-sm:px-4">
          <h1 className="mb-1.5 font-serif text-[40px] leading-[1.05] font-medium">
            Atlas design system
          </h1>
          <p className="mb-9 max-w-[620px] text-ui text-tx2">
            Dark-first, compact, content-dominant. Green is a signal, not a
            surface. Serif marks editorial moments; sans runs the interface;
            mono runs code. Values come from the approved handoff, with the
            contrast adjustments listed below.
          </p>
          <Section title={`Color — ${theme}`}>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
              {tokenTable.map((c) => (
                <li
                  key={c.token}
                  className="overflow-hidden rounded-lg border border-bd2"
                >
                  <div
                    className="h-[52px] border-b border-bd2"
                    style={{ background: `var(${c.token})` }}
                  />
                  <div className="px-[9px] py-[7px]">
                    <div className="text-xs font-medium">{c.name}</div>
                    <div className="font-mono text-[11px] text-tx3">
                      {c.token} · {c[theme]}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Theme comparison">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['dark', 'light'] as const).map((k) => (
                <div
                  key={k}
                  className={cn(
                    k === 'dark' ? 'theme-dark' : 'theme-light',
                    'rounded-xl border border-bd bg-sb p-1.5 text-tx',
                  )}
                >
                  <div className="rounded-lg border border-bd2 bg-canvas p-3.5">
                    <div className="mb-2 font-serif text-xl font-medium">
                      {k === 'dark' ? 'Dark' : 'Light'}
                    </div>
                    <div className="mb-3 flex h-[34px] items-center gap-1.5 rounded-[9px] border border-aiib bg-aiin pr-1 pl-2 text-ctl text-tx3">
                      <Plus aria-hidden="true" className="size-3.5 text-actx" />
                      <span className="flex-1">Ask Atlas</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-7 items-center rounded-md bg-acb px-3 text-ctl font-medium text-white">
                        Share
                      </span>
                      <span className="inline-flex h-7 items-center rounded-md border border-bd bg-el px-2.5 text-ctl">
                        History
                      </span>
                      <span className="rounded-xs bg-acs px-1.5 py-px text-xs text-actx">
                        Okafor et al., 2024
                      </span>
                      <span className="text-[11.5px] text-tx3">Meta text</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Typography">
            <div className="border-t border-bd2">
              {typeScale.map(([name, spec, cls, sample]) => (
                <div
                  key={name}
                  className="grid grid-cols-[180px_minmax(0,1fr)] items-baseline gap-4 border-b border-bd2 py-3 max-sm:grid-cols-1"
                >
                  <div className="font-mono text-[11px] text-tx3">
                    {name}
                    <br />
                    {spec}
                  </div>
                  <div className={cn('leading-[1.25]', cls)}>{sample}</div>
                </div>
              ))}
            </div>
          </Section>
          <div className="mb-10 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8">
            <section aria-labelledby="ds-space">
              <h2
                id="ds-space"
                className="mb-3 font-serif text-2xl font-medium"
              >
                Spacing · 4px base
              </h2>
              <ul className="flex flex-col gap-1.5">
                {[4, 8, 12, 16, 24, 32, 48].map((v, i) => (
                  <li
                    key={v}
                    className="flex items-center gap-2.5 font-mono text-[11px] text-tx3"
                  >
                    <span className="w-14">space-{i + 1}</span>
                    <span
                      className="h-2.5 rounded-[2px] bg-ac opacity-70"
                      style={{ width: v }}
                    />
                    <span>{v}px</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="ds-radii">
              <h2
                id="ds-radii"
                className="mb-3 font-serif text-2xl font-medium"
              >
                Radii &amp; elevation
              </h2>
              <ul className="flex flex-wrap gap-3">
                {radii.map(([name, value, cls, shadow]) => (
                  <li key={name} className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        'h-12 w-16 border border-bd bg-el',
                        cls,
                        shadow && 'shadow-pop',
                      )}
                    />
                    <span className="text-center font-mono text-[10.5px] text-tx3">
                      {name}
                      <br />
                      {value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <Section title="Controls">
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-xl border border-bd2 p-[18px]">
              <Btn variant="primary" className="px-3">
                Primary 28
              </Btn>
              <Btn variant="secondary">Secondary</Btn>
              <Btn variant="ghost">Ghost</Btn>
              <Btn variant="ai">
                <Sparkles aria-hidden="true" />
                AI action
              </Btn>
              <Btn variant="subtle" disabled>
                Disabled
              </Btn>
              <RefChip
                icon={<BookOpen aria-hidden="true" />}
                onRemove={() => {}}
                removeLabel="Remove sample chip"
              >
                Reference chip
              </RefChip>
              <span className="rounded-xs bg-acs px-1.5 py-px text-xs text-actx">
                Okafor et al., 2024
              </span>
              <StatusTag>Status tag</StatusTag>
              <SampleTag>Sample</SampleTag>
              <Segmented
                label="Sample segmented control"
                value="a"
                onChange={() => {}}
                options={[
                  { value: 'a', label: 'Segment' },
                  { value: 'b', label: 'Option' },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-bd2 p-[18px]">
              <div className="flex h-[42px] min-w-[300px] flex-1 items-center gap-1.5 rounded-xl border border-aiib bg-aiin pr-1.5 pl-2 max-sm:min-w-0">
                <span className="grid size-7 place-items-center text-actx">
                  <Plus aria-hidden="true" className="size-[17px]" />
                </span>
                <span className="flex-1 text-[13.5px] text-tx3">
                  Ask Atlas — composer, 42px, radius 10
                </span>
                <span className="grid size-7 place-items-center rounded-[7px] bg-acb text-white">
                  <ArrowUp aria-hidden="true" className="size-[15px]" />
                </span>
              </div>
              <div className="flex h-8 min-w-[240px] flex-1 items-center rounded-[7px] border border-bd bg-canvas px-2.5 text-ctl text-tx3 max-sm:min-w-0">
                Text input 32 · border var(--bd)
              </div>
            </div>
          </Section>
          <Section title="Interaction states">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] overflow-hidden rounded-xl border border-bd2 text-xs">
                <thead>
                  <tr className="bg-card text-tx3">
                    {[
                      '',
                      'Default',
                      'Hover',
                      'Focus',
                      'Disabled',
                      'Loading',
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-3 py-[9px] text-left font-normal"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-bd2">
                    <th scope="row" className="p-3 text-left font-medium">
                      Primary
                    </th>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md bg-acb px-3 font-medium text-white">
                        Share
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md bg-acbh px-3 font-medium text-white">
                        Share
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md bg-acb px-3 font-medium text-white outline-2 outline-offset-2 outline-ac outline-solid">
                        Share
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md bg-acb px-3 font-medium text-white opacity-45">
                        Share
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-acb px-3 font-medium text-white">
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-3 animate-spin"
                        />
                        Sharing
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-bd2">
                    <th scope="row" className="p-3 text-left font-medium">
                      Secondary
                    </th>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md border border-bd bg-el px-2.5">
                        History
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md border border-bd bg-hov px-2.5">
                        History
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md border border-bd bg-el px-2.5 outline-2 outline-offset-1 outline-ac outline-solid">
                        History
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center rounded-md border border-bd bg-el px-2.5 opacity-45">
                        History
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-bd bg-el px-2.5">
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-3 animate-spin"
                        />
                        Loading
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-bd2">
                    <th scope="row" className="p-3 text-left font-medium">
                      Nav item
                    </th>
                    <td className="p-3">
                      <span className="flex h-[30px] items-center rounded-md px-2 text-tx2">
                        Library
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[30px] items-center rounded-md bg-hov px-2 text-tx">
                        Library
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[30px] items-center rounded-md px-2 outline-2 -outline-offset-1 outline-ac outline-solid">
                        Library
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[30px] items-center rounded-md px-2 text-tx2 opacity-45">
                        Library
                      </span>
                    </td>
                    <td className="p-3 text-tx3">
                      Active = hover surface + primary text
                    </td>
                  </tr>
                  <tr className="border-t border-bd2">
                    <th scope="row" className="p-3 text-left font-medium">
                      AI composer
                    </th>
                    <td className="p-3">
                      <span className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-aiib bg-aiin px-2 text-tx3">
                        <Plus
                          aria-hidden="true"
                          className="size-3.5 text-actx"
                        />
                        Ask
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-aiib bg-aiin px-2 text-tx2">
                        <Plus
                          aria-hidden="true"
                          className="size-3.5 text-actx"
                        />
                        Ask
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-ac bg-aiin px-2 shadow-[0_0_0_3px_var(--acs)]">
                        <Plus
                          aria-hidden="true"
                          className="size-3.5 text-actx"
                        />
                        Compare…
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-bd2 bg-el px-2 text-tx3 opacity-60">
                        <Plus aria-hidden="true" className="size-3.5" />
                        Offline
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-aiib bg-aiin px-2 text-tx3">
                        <span className="flex-1">Preview…</span>
                        <span className="size-2 animate-atlas-pulse rounded-full bg-actx" />
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          <Section title={`Contrast — ${theme}`}>
            <p className="-mt-1 mb-3 text-ctl text-tx3">
              WCAG 2.1 ratios computed from the shipped tokens. Switch the theme
              to check the other set.
            </p>
            <table className="mb-6 w-full text-ctl">
              <thead className="sr-only">
                <tr>
                  <th>Sample</th>
                  <th>Pair</th>
                  <th>Requirement</th>
                  <th>Ratio</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {contrastPairs(theme).map((p) => {
                  const pass = p.ratio >= p.need;
                  return (
                    <tr key={p.name} className="border-b border-bd2">
                      <td className="w-11 py-[9px]">
                        <span
                          className="grid h-[26px] place-items-center rounded-sm border border-bd2 font-semibold"
                          style={{ background: p.bg, color: p.fg }}
                        >
                          Aa
                        </span>
                      </td>
                      <td className="px-3">{p.name}</td>
                      <td className="text-[11.5px] text-tx3 max-sm:hidden">
                        {p.need === 3
                          ? 'Non-text · needs 3'
                          : 'Small text · needs 4.5'}
                      </td>
                      <td className="tnum font-mono text-xs">
                        {p.ratio.toFixed(2)}:1
                      </td>
                      <td
                        className={cn(
                          'pl-3 font-semibold',
                          pass ? 'text-actx' : 'text-danger',
                        )}
                      >
                        {pass ? (p.ratio >= 7 ? 'AAA' : 'AA') : 'Fails'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h3 className="mb-2 text-ctl font-semibold">
              Adjusted from the handoff
            </h3>
            <ul className="border-t border-bd2">
              {contrastAdjustments.map((a) => (
                <li
                  key={a.token + a.theme}
                  className="grid grid-cols-[150px_70px_minmax(0,1fr)] gap-3 border-b border-bd2 py-2 text-xs max-sm:grid-cols-1"
                >
                  <span className="font-mono">{a.token}</span>
                  <span className="text-tx3">{a.theme}</span>
                  <span className="text-tx2">
                    <span className="font-mono">{a.handoff}</span> →{' '}
                    <span className="font-mono">{a.now}</span> · {a.reason}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Motion">
            <ul className="border-t border-bd2">
              {motion.map(([name, duration, use]) => (
                <li
                  key={name}
                  className="grid grid-cols-[200px_200px_minmax(0,1fr)] gap-4 border-b border-bd2 py-2.5 text-ctl max-md:grid-cols-1 max-md:gap-0.5"
                >
                  <span className="font-medium">{name}</span>
                  <span className="font-mono text-[11.5px] text-tx3">
                    {duration}
                  </span>
                  <span className="text-tx2">{use}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="mb-10">
      <h2 className="mb-3 font-serif text-2xl font-medium">{title}</h2>
      {children}
    </section>
  );
}
