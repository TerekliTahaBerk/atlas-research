'use client';
import { useState } from 'react';
import { z } from 'zod';
import {
  memberDto,
  memberPageDto,
  invitationPageDto,
  type MemberPage,
  invitationDto,
  type Scope,
  type Capability,
} from '@atlas/core';
import { mutate, requestData } from './client';
import { buttonClass, inputClass } from './live-home';
type Member = z.infer<typeof memberDto>;
export function MembershipPanel({
  scope,
  scopeId,
  capabilities,
  initial,
}: {
  scope: Scope;
  scopeId: string;
  capabilities: Capability[];
  initial: MemberPage;
}) {
  const [members, setMembers] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [inviteCursor, setInviteCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(scope === 'project' ? 'VIEWER' : 'MEMBER');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<z.infer<typeof invitationDto>[]>([]);
  const canManage = capabilities.includes(`${scope}.members.manage`);
  const roles =
    scope === 'project'
      ? ['OWNER', 'EDITOR', 'VIEWER']
      : scope === 'organization'
        ? ['OWNER', 'ADMIN', 'MEMBER']
        : ['ADMIN', 'MEMBER', 'VIEWER'];
  async function refresh(cursor?: string) {
    const page = await requestData(
      `/api/v1/${scope}s/${scopeId}/members${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      memberPageDto,
    );
    setMembers((previous) =>
      cursor ? [...previous, ...page.items] : page.items,
    );
    setNextCursor(page.nextCursor);
  }
  async function loadInvites(cursor?: string) {
    const page = await requestData(
      `/api/v1/invitations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      invitationPageDto,
    );
    setInvites((previous) =>
      cursor ? [...previous, ...page.items] : page.items,
    );
    setInviteCursor(page.nextCursor);
  }
  return (
    <section className="mt-8 max-w-[700px]">
      <h2 className="mb-3 font-serif text-2xl">Members</h2>
      <ul className="divide-y divide-bd2 border-y border-bd2">
        {members.map((member) => (
          <li
            key={member.profileId}
            className="flex flex-wrap items-center gap-3 py-3 text-ui"
          >
            <span className="min-w-0 flex-1 truncate" title={member.profileId}>
              Researcher {member.profileId.slice(0, 8)}
            </span>
            {nextCursor ? (
              <button
                type="button"
                className="mt-3 text-xs text-actx underline"
                onClick={async () => {
                  try {
                    await refresh(nextCursor);
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : 'Unable to load members.',
                    );
                  }
                }}
              >
                More members
              </button>
            ) : null}
            {canManage ? (
              <>
                <label
                  className="sr-only"
                  htmlFor={`role-${scope}-${member.profileId}`}
                >
                  Role for {member.profileId.slice(0, 8)}
                </label>
                <select
                  id={`role-${scope}-${member.profileId}`}
                  disabled={busy}
                  className="h-8 rounded-lg border border-bd bg-card px-2 text-xs"
                  value={member.role}
                  onChange={async (e) => {
                    setBusy(true);
                    setMessage('');
                    try {
                      await mutate({
                        command: 'membership.set',
                        scope,
                        scopeId,
                        profileId: member.profileId,
                        expectedVersion: member.version,
                        role: e.target.value as Member['role'],
                      });
                      await refresh();
                      setMessage('Role updated.');
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'Unable to update the role.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-danger"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Remove this member and their access in this scope?',
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await mutate({
                        command: 'membership.remove',
                        scope,
                        scopeId,
                        profileId: member.profileId,
                        expectedVersion: member.version,
                      });
                      await refresh();
                      setMessage('Membership removed.');
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'Unable to remove the member.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-xs text-tx2">{member.role}</span>
            )}
          </li>
        ))}
      </ul>
      {canManage ? (
        <>
          <h3 className="mt-6 mb-2 font-medium">Invite a collaborator</h3>
          <p className="mb-3 text-xs text-tx3">
            Local development links are available when configured. Email
            delivery is unavailable; the server will say if invitations are
            disabled.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              setLink('');
              try {
                const result = await mutate({
                  command: 'invitation.create',
                  scope,
                  scopeId,
                  email,
                  role: role as Member['role'],
                });
                setLink(result.invitationLink ?? '');
                setMessage('Invitation created. No email was sent.');
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : 'Unable to invite.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="min-w-[180px] flex-1 text-xs text-tx2">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs text-tx2">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputClass}
              >
                {roles
                  .filter((r) => scope !== 'organization' || r !== 'OWNER')
                  .map((r) => (
                    <option key={r}>{r}</option>
                  ))}
              </select>
            </label>
            <button disabled={busy} className={buttonClass}>
              Create invitation
            </button>
          </form>
          {link ? (
            <label className="mt-3 block text-xs text-tx2">
              Private development invitation link
              <input
                readOnly
                value={link}
                className={inputClass}
                onFocus={(e) => e.target.select()}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="mt-4 text-xs text-actx underline"
            onClick={async () => {
              try {
                await loadInvites();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load invitations.',
                );
              }
            }}
          >
            Manage invitations
          </button>
          {inviteCursor ? (
            <button
              type="button"
              className="ml-3 text-xs text-actx underline"
              onClick={async () => {
                try {
                  await loadInvites(inviteCursor);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Unable to load invitations.',
                  );
                }
              }}
            >
              More invitations
            </button>
          ) : null}
          <ul>
            {invites.map((i) => (
              <li
                key={i.id}
                className="mt-2 flex flex-wrap gap-2 text-xs text-tx2"
              >
                <span>
                  {i.email} · {i.role} ·{' '}
                  {i.accepted
                    ? 'Accepted'
                    : i.revoked
                      ? 'Revoked'
                      : `Expires ${i.expiresAt.slice(0, 10)}`}
                </span>
                {!i.accepted && !i.revoked ? (
                  <button
                    type="button"
                    className="text-danger"
                    onClick={async () => {
                      try {
                        await mutate({
                          command: 'invitation.revoke',
                          id: i.id,
                        });
                        setInvites((list) =>
                          list.map((x) =>
                            x.id === i.id ? { ...x, revoked: true } : x,
                          ),
                        );
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : 'Unable to revoke.',
                        );
                      }
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p role="status" className="mt-3 text-xs text-tx2">
        {message}
      </p>
    </section>
  );
}
