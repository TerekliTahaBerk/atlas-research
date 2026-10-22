'use client';
import { useRouter } from 'next/navigation';
import { TenantDirectory } from './tenant-directory';
import { useState } from 'react';
import type { PlatformState, MemberPage, PlatformCommand } from '@atlas/core';
import { Topbar, Crumb } from '@/features/shell/topbar';
import { ThemeMenu } from '@/features/shell/theme-menu';
import { MembershipPanel } from './membership-panel';
import { mutate } from './client';
import { buttonClass, inputClass } from './live-home';
export function LiveSettings({
  state,
  section,
  orgMembers,
  workspaceMembers,
}: {
  state: PlatformState;
  section: string;
  orgMembers: MemberPage;
  workspaceMembers: MemberPage;
}) {
  const router = useRouter();
  const selected = state.workspaces.find((w) => w.id === state.workspaceId);
  const org =
    state.organizations.find((o) => o.id === state.organizationId) ??
    state.organizations[0];
  const [displayName, setDisplayName] = useState(
    state.profile?.displayName ?? '',
  );
  const [researchRole, setResearchRole] = useState(
    state.profile?.researchRole ?? '',
  );
  const [interests, setInterests] = useState(
    state.profile?.researchInterests.join(', ') ?? '',
  );
  const [orgName, setOrgName] = useState(org?.name ?? '');
  const [wsName, setWsName] = useState(selected?.name ?? '');
  const [newOrg, setNewOrg] = useState('');
  const [newWs, setNewWs] = useState('');
  const [organizationId, setOrganizationId] = useState(org?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function action(command: PlatformCommand) {
    setBusy(true);
    setMessage('');
    try {
      const result = await mutate(command);
      if (command.command === 'organization.create')
        router.push(`/app/settings/workspace?organizationId=${result.id}`);
      else if (command.command === 'workspace.create')
        router.push(`/app/settings/workspace?workspaceId=${result.id}`);
      else if (command.command.endsWith('.archive')) router.push('/app/home');
      else window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar bordered>
        <Crumb title="Settings" />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-[1000px] px-8 py-10 max-sm:px-4">
          <h1 className="mb-6 font-serif text-4xl font-medium">Settings</h1>
          <nav
            aria-label="Settings"
            className="mb-7 flex flex-wrap gap-4 text-ui text-tx2"
          >
            {['profile', 'appearance', 'workspace', 'plan'].map((s) => (
              <a
                key={s}
                href={`/app/settings/${s}`}
                aria-current={section === s ? 'page' : undefined}
                className={section === s ? 'text-actx' : ''}
              >
                {s === 'plan'
                  ? 'Plan & usage'
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            ))}
          </nav>
          {section === 'profile' ? (
            <>
              <form
                className="flex max-w-[520px] flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    command: 'profile.update',
                    displayName,
                    ...(researchRole ? { researchRole } : {}),
                    researchInterests: interests
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                }}
              >
                <label className="text-xs text-tx2">
                  Display name
                  <input
                    required
                    maxLength={120}
                    className={inputClass}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label className="text-xs text-tx2">
                  Account email
                  <input className={inputClass} readOnly value={state.email} />
                </label>
                <label className="text-xs text-tx2">
                  Research role
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={researchRole}
                    onChange={(e) => setResearchRole(e.target.value)}
                  />
                </label>
                <label className="text-xs text-tx2">
                  Research interests (comma separated)
                  <input
                    className={inputClass}
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                  />
                </label>
                <p className="text-xs text-tx3">
                  Avatar uploads are not available yet. Your initial is
                  displayed.
                </p>
                <button disabled={busy} className={buttonClass}>
                  Save profile
                </button>
              </form>
            </>
          ) : null}
          {section === 'appearance' ? (
            <div>
              <h2 className="mb-4 font-serif text-2xl">Appearance</h2>
              <ThemeMenu />
            </div>
          ) : null}
          {section === 'plan' ? (
            <p className="text-ui text-tx2">
              Billing and plan changes are not available in Phase 01. No payment
              is requested.
            </p>
          ) : null}
          {section === 'workspace' ? (
            <>
              <TenantDirectory state={state} destination="settings" />
              {org ? (
                <section className="mt-6">
                  <h2 className="mb-3 font-serif text-2xl">
                    {org.personal
                      ? 'Personal organization'
                      : 'Research organization'}
                  </h2>
                  <p className="mb-3 text-ui text-tx2">{org.name}</p>
                  {org.capabilities.includes('organization.update') ? (
                    <form
                      className="flex max-w-[520px] gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action({
                          command: 'organization.update',
                          id: org.id,
                          name: orgName,
                          expectedVersion: org.version,
                        });
                      }}
                    >
                      <label className="min-w-0 flex-1 text-xs text-tx2">
                        Organization name
                        <input
                          required
                          className={inputClass}
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          maxLength={120}
                        />
                      </label>
                      <button disabled={busy} className={buttonClass}>
                        Save organization
                      </button>
                    </form>
                  ) : null}
                  {org.capabilities.includes('organization.archive') ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-3 text-xs text-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Archive “${org.name}” and hide all its workspaces and projects?`,
                          )
                        )
                          void action({
                            command: 'organization.archive',
                            id: org.id,
                            expectedVersion: org.version,
                          });
                      }}
                    >
                      Archive organization
                    </button>
                  ) : null}
                  <MembershipPanel
                    scope="organization"
                    scopeId={org.id}
                    capabilities={org.capabilities}
                    initial={orgMembers}
                  />
                </section>
              ) : null}
              {selected ? (
                <section className="mt-8">
                  <h2 className="mb-3 font-serif text-2xl">Workspace</h2>
                  <p className="mb-3 text-ui text-tx2">{selected.name}</p>
                  {selected.capabilities.includes('workspace.update') ? (
                    <form
                      className="flex max-w-[520px] gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action({
                          command: 'workspace.update',
                          id: selected.id,
                          name: wsName,
                          expectedVersion: selected.version,
                        });
                      }}
                    >
                      <label className="min-w-0 flex-1 text-xs text-tx2">
                        Workspace name
                        <input
                          required
                          className={inputClass}
                          value={wsName}
                          onChange={(e) => setWsName(e.target.value)}
                          maxLength={120}
                        />
                      </label>
                      <button disabled={busy} className={buttonClass}>
                        Save workspace
                      </button>
                    </form>
                  ) : null}
                  {selected.capabilities.includes('workspace.archive') ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-3 text-xs text-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Archive “${selected.name}” and hide its projects?`,
                          )
                        )
                          void action({
                            command: 'workspace.archive',
                            id: selected.id,
                            expectedVersion: selected.version,
                          });
                      }}
                    >
                      Archive workspace
                    </button>
                  ) : null}
                  <MembershipPanel
                    scope="workspace"
                    scopeId={selected.id}
                    capabilities={selected.capabilities}
                    initial={workspaceMembers}
                  />
                </section>
              ) : null}
              <section className="mt-10 max-w-[520px]">
                <h2 className="mb-3 font-serif text-2xl">
                  Create an organization
                </h2>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({
                      command: 'organization.create',
                      name: newOrg,
                    });
                  }}
                >
                  <label className="min-w-0 flex-1 text-xs text-tx2">
                    Organization name
                    <input
                      className={inputClass}
                      required
                      maxLength={120}
                      value={newOrg}
                      onChange={(e) => setNewOrg(e.target.value)}
                    />
                  </label>
                  <button disabled={busy} className={buttonClass}>
                    Create organization
                  </button>
                </form>
              </section>
              <section className="mt-8 max-w-[520px]">
                <h2 className="mb-3 font-serif text-2xl">Create a workspace</h2>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({
                      command: 'workspace.create',
                      organizationId,
                      name: newWs,
                    });
                  }}
                >
                  <label className="text-xs text-tx2">
                    Organization
                    <select
                      required
                      className={inputClass}
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                    >
                      {state.organizations
                        .filter((o) =>
                          o.capabilities.includes('workspace.create'),
                        )
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs text-tx2">
                    Workspace name
                    <input
                      className={inputClass}
                      required
                      maxLength={120}
                      value={newWs}
                      onChange={(e) => setNewWs(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !organizationId}
                    className={buttonClass}
                  >
                    Create workspace
                  </button>
                </form>
              </section>
            </>
          ) : null}
          <p role="status" className="mt-4 text-sm text-danger">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
