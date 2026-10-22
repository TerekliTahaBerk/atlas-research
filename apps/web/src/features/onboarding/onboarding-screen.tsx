'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  Compass,
  FileCode,
  FlaskConical,
  GraduationCap,
  Landmark,
  Microscope,
  PenLine,
  Plus,
  Sparkles,
  Telescope,
  User,
  Users,
} from 'lucide-react';
import type { z } from 'zod';
import type { onboardingDraft } from '@atlas/core';
import { mutate } from '@/features/platform/client';
import { cn } from '@atlas/ui/lib/utils';
import {
  onboardingFields,
  onboardingRoles,
  onboardingSteps,
  onboardingTemplates,
  onboardingWorkspaces,
} from '@/lib/preview/extras';
const roleIcons = [
  GraduationCap,
  BookOpen,
  Microscope,
  Landmark,
  Building2,
  Compass,
];
const wsIcons = { solo: User, lab: Users, dept: Landmark } as const;
const tplIcons = {
  review: Telescope,
  paper: FileCode,
  thesis: BookMarked,
  exp: FlaskConical,
} as const;
function OptionCard({
  selected,
  onSelect,
  icon: Icon,
  label,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof User;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-[108px] flex-col gap-2.5 rounded-2xl p-4 text-left hover:border-tx3',
        selected
          ? 'border-[1.5px] border-ac bg-acs'
          : 'border border-bd bg-card',
      )}
    >
      <span className="flex items-center">
        <Icon
          aria-hidden="true"
          className={cn('size-[18px]', selected ? 'text-actx' : 'text-tx2')}
        />
        <span className="flex-1" />
        {selected ? (
          <span
            aria-hidden="true"
            className="grid size-[18px] place-items-center rounded-full bg-acb text-white"
          >
            <Check className="size-[11px]" />
          </span>
        ) : null}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {description ? (
        <span className="-mt-1.5 text-xs text-tx3">{description}</span>
      ) : null}
    </button>
  );
}
/**
 * Seven-step onboarding preview (prototype onboarding overlay). Choices
 * stay in component state; nothing is created, invited or stored.
 */
export function OnboardingScreen({
  live = false,
  draft,
}: {
  live?: boolean;
  draft?: z.infer<typeof onboardingDraft>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = Math.min(6, Math.max(0, Number(params.get('step') ?? 1) - 1));
  const [step, setStep] = useState(
    live ? (draft?.step ?? 0) : Number.isFinite(initial) ? initial : 0,
  );
  const [role, setRole] = useState<string>(
    draft?.researchRole ?? 'PhD researcher',
  );
  const [fields, setFields] = useState<string[]>(
    draft?.researchInterests ??
      (live ? [] : ['Machine learning', 'Structural biology']),
  );
  const [ws, setWs] = useState<string>(live ? 'solo' : 'lab');
  const [tpl, setTpl] = useState<string>('paper');
  const [wsName, setWsName] = useState(
    draft?.workspaceName ?? (live ? 'My Research' : 'Kaya Lab'),
  );
  const [projectName, setProjectName] = useState(
    draft?.projectName ?? (live ? '' : 'Sparse Evoformer'),
  );
  const [invites, setInvites] = useState(
    live
      ? []
      : ['ayse.demir@kayalab.example', 'mehmet.kaya@kayalab.example', ''],
  );
  const s = onboardingSteps[step] ?? onboardingSteps[0];
  const [displayName, setDisplayName] = useState(
    draft?.displayName ?? 'Researcher',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function finish() {
    setBusy(true);
    setError('');
    try {
      const result = await mutate({
        command: 'bootstrap',
        displayName,
        researchRole: role,
        researchInterests: fields,
        workspaceName: wsName,
        ...(projectName.trim() ? { projectName } : {}),
      });
      window.location.assign(
        result.projectId
          ? `/app/projects/${result.projectId}/overview`
          : `/app/workspaces/${result.workspaceId}`,
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to complete setup.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    if (!live) {
      if (step === 6) router.push('/app/home');
      else setStep(step + 1);
      return;
    }
    if (step === 6) {
      await finish();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutate({
        command: 'onboarding.save',
        draft: {
          displayName,
          researchRole: role,
          researchInterests: fields,
          workspaceName: wsName,
          projectName,
          step: step + 1,
        },
      });
      setStep(step + 1);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to save setup.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-dvh flex-col overflow-auto bg-canvas text-tx">
      <header className="flex items-center gap-3.5 px-5 py-4">
        <span
          aria-hidden="true"
          className="grid size-[22px] place-items-center rounded-[5px] bg-acb font-serif text-base font-semibold text-white"
        >
          A
        </span>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={7}
          aria-valuenow={step + 1}
          className="flex flex-1 justify-center gap-[5px]"
        >
          {onboardingSteps.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                'h-1 rounded-[2px] transition-[width] duration-200',
                i <= step ? 'bg-ac' : 'bg-bd',
              )}
              style={{ width: i === step ? 28 : 14 }}
            />
          ))}
        </div>
        <Link
          onClick={(e) => {
            if (live) {
              e.preventDefault();
              void finish();
            }
          }}
          href="/app/home"
          className="h-7 rounded-md px-2.5 text-ctl leading-7 text-tx2 hover:bg-hov"
        >
          Skip
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-6 pt-[6vh] pb-10">
        <div className="w-full max-w-[720px]">
          <div className="tnum mb-2.5 text-xs text-tx3">
            Step {step + 1} of 7
          </div>
          <h1 className="mb-2.5 font-serif text-[44px] leading-[1.05] font-medium text-balance max-sm:text-[34px]">
            {s.title}
          </h1>
          <p className="mb-7 max-w-[540px] text-sm text-tx2">{s.sub}</p>
          {live && step === 0 ? (
            <label className="mb-5 flex max-w-[420px] flex-col gap-1.5 text-xs text-tx2">
              Display name
              <input
                required
                maxLength={120}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-10 rounded-lg border border-bd bg-card px-3 text-sm text-tx"
              />
            </label>
          ) : null}
          {step === 0 ? (
            <ul className="mb-7 flex flex-col border-t border-bd2">
              {[
                [
                  Telescope,
                  'Find and read',
                  live
                    ? 'A personal research workspace and real project containers.'
                    : 'Search scholarly sources, save to your library, annotate PDFs.',
                ],
                [
                  PenLine,
                  'Write',
                  live
                    ? 'Documents and manuscripts arrive in later phases.'
                    : 'Research notes and LaTeX manuscripts with live preview.',
                ],
                [
                  Sparkles,
                  'Ask Atlas anywhere',
                  live
                    ? 'AI presentation is available; no model is connected.'
                    : 'Context-aware help that cites its sources.',
                ],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof User;
                return (
                  <li
                    key={t as string}
                    className="flex gap-3.5 border-b border-bd2 py-3.5"
                  >
                    <I aria-hidden="true" className="mt-0.5 size-4 text-actx" />
                    <div>
                      <div className="font-medium">{t as string}</div>
                      <div className="text-ctl text-tx3">{d as string}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {step === 1 ? (
            <div
              role="radiogroup"
              aria-label="Research role"
              className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5"
            >
              {onboardingRoles.map((r, i) => (
                <OptionCard
                  key={r}
                  icon={roleIcons[i] ?? User}
                  label={r}
                  selected={role === r}
                  onSelect={() => setRole(r)}
                />
              ))}
            </div>
          ) : null}
          {step === 2 ? (
            <div
              role="group"
              aria-label="Research fields"
              className="mb-7 flex flex-wrap gap-2"
            >
              {onboardingFields.map((f) => {
                const on = fields.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setFields((v) =>
                        on ? v.filter((x) => x !== f) : [...v, f],
                      )
                    }
                    className={cn(
                      'inline-flex h-[34px] items-center gap-1.5 rounded-[17px] border px-3.5 text-ui',
                      on
                        ? 'border-aiib bg-acs text-actx'
                        : 'border-bd text-tx2 hover:bg-hov',
                    )}
                  >
                    {on ? (
                      <Check aria-hidden="true" className="size-[13px]" />
                    ) : null}
                    {f}
                  </button>
                );
              })}
              <span className="inline-flex h-[34px] items-center gap-1.5 rounded-[17px] border border-dashed border-bd px-3.5 text-ui text-tx3">
                <Plus aria-hidden="true" className="size-[13px]" />
                Add a field
              </span>
            </div>
          ) : null}
          {step === 3 || step === 4 ? (
            <>
              <div
                role="radiogroup"
                aria-label={step === 3 ? 'Workspace type' : 'Project template'}
                className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5"
              >
                {step === 3
                  ? onboardingWorkspaces
                      .filter((w) => !live || w.key === 'solo')
                      .map((w) => (
                        <OptionCard
                          key={w.key}
                          icon={wsIcons[w.key]}
                          label={w.label}
                          description={w.description}
                          selected={ws === w.key}
                          onSelect={() => setWs(w.key)}
                        />
                      ))
                  : onboardingTemplates.map((t) => (
                      <OptionCard
                        key={t.key}
                        icon={tplIcons[t.key]}
                        label={t.label}
                        description={t.description}
                        selected={tpl === t.key}
                        onSelect={() => setTpl(t.key)}
                      />
                    ))}
              </div>
              <label className="mb-6 flex max-w-[420px] flex-col gap-1.5 text-xs text-tx2">
                {step === 3 ? 'Workspace name' : 'Project name'}
                <input
                  value={step === 3 ? wsName : projectName}
                  onChange={(e) =>
                    step === 3
                      ? setWsName(e.target.value)
                      : setProjectName(e.target.value)
                  }
                  className="h-10 rounded-lg border border-bd bg-card px-3 text-[15px] text-tx"
                />
              </label>
            </>
          ) : null}
          {live && step === 5 ? (
            <p className="mb-7 max-w-[520px] text-sm text-tx2">
              Create your workspace first. You can invite collaborators from its
              settings or your project’s Members panel after setup. No
              invitation is sent during onboarding.
            </p>
          ) : null}
          {!live && step === 5 ? (
            <div className="mb-7 flex max-w-[520px] flex-col gap-2">
              {invites.map((v, i) => (
                <div key={i} className="flex gap-1.5">
                  <label className="sr-only" htmlFor={`invite-${i}`}>
                    Invite email {i + 1}
                  </label>
                  <input
                    id={`invite-${i}`}
                    value={v}
                    onChange={(e) =>
                      setInvites((list) =>
                        list.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    placeholder="colleague@university.edu"
                    className="h-[38px] flex-1 rounded-lg border border-bd bg-card px-3 text-[13.5px]"
                  />
                  <span className="flex h-[38px] items-center gap-1 rounded-lg border border-bd px-3 text-ctl text-tx2">
                    {i < 2 ? 'Editor' : 'Viewer'}
                    <ChevronDown aria-hidden="true" className="size-3" />
                  </span>
                </div>
              ))}
              <span className="text-xs text-tx3">
                Invitations aren’t sent in this preview.
              </span>
            </div>
          ) : null}
          {step === 6 ? (
            <dl className="mb-7 max-w-[520px] rounded-2xl border border-bd2 px-4 py-1.5">
              {[
                ['Role', role],
                ['Fields', fields.join(', ') || '—'],
                [
                  'Workspace',
                  `${wsName} · ${onboardingWorkspaces.find((w) => w.key === ws)?.label ?? ''}`,
                ],
                [
                  'First project',
                  `${projectName} · ${onboardingTemplates.find((t) => t.key === tpl)?.label ?? ''}`,
                ],
                [
                  'Invited',
                  `${invites.filter(Boolean).length} people (not sent)`,
                ],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex gap-3 border-b border-bd2 py-2.5 text-ui last:border-0"
                >
                  <dt className="w-[120px] text-tx3">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="h-10 rounded-lg border border-bd px-4 text-[13.5px] hover:bg-hov"
              >
                Back
              </button>
            ) : null}
            <button
              disabled={busy}
              type="button"
              onClick={() => void next()}
              className="inline-flex h-10 items-center gap-[7px] rounded-lg bg-tx px-5 text-[13.5px] font-medium text-canvas hover:opacity-90"
            >
              {busy
                ? 'Saving…'
                : step === 0
                  ? 'Get started'
                  : step === 6
                    ? 'Open Atlas'
                    : 'Continue'}
              <ArrowRight aria-hidden="true" className="size-[14px]" />
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <p className="mt-6 text-[11px] text-tx3">
            {live
              ? 'Setup progress is saved to your account. Every researcher gets a personal environment; shared organizations can be created later in Settings. Project templates do not create research content.'
              : 'Preview walkthrough — no account, workspace or project is created, and nothing is stored.'}
          </p>
        </div>
      </main>
    </div>
  );
}
