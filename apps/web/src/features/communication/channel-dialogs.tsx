'use client';
import { useEffect, useState } from 'react';
import { randomUUID } from './ids';
import { BookOpen, FileText, ListTodo, Lock, Quote } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  CHANNEL_NAME,
  type ArtifactKind,
  type ChannelDetailDto,
  type ParticipantDto,
  type RecoverableChannelDto,
} from '@atlas/core';
import { Btn } from '@/components/atlas/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { fetchOptions, fetchParticipants } from '@/features/artifacts/client';
import { fetchAnnotations, fetchPaper } from '@/features/library/client';
import { communicate } from './client';
import type { ShareDraft } from './composer';

const field =
  'h-9 w-full rounded-lg border border-bd bg-el px-3 text-ui outline-none focus:border-actx';
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong.';

export function CreateChannelDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
  suggestDefault,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
  suggestDefault: boolean;
}) {
  const [name, setName] = useState(suggestDefault ? 'general' : '');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PROJECT' | 'RESTRICTED'>(
    'PROJECT',
  );
  const [key] = useState(randomUUID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = CHANNEL_NAME.test(name);
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="w-[min(460px,calc(100vw-32px))] rounded-2xl p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          New channel
        </ModalTitle>
        <ModalDescription className="mb-4 text-ctl text-tx2">
          Channels belong to this project. Restricted channels are visible only
          to people you add — project access alone is not enough.
        </ModalDescription>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            setError('');
            try {
              const result = await communicate({
                command: 'channel.create',
                projectId,
                name,
                description,
                visibility,
                isDefault: suggestDefault && visibility === 'PROJECT',
                idempotencyKey: key,
              });
              onCreated(result.id);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-ctl">
            Name
            <input
              value={name}
              onChange={(e) =>
                setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))
              }
              maxLength={80}
              aria-invalid={!!name && !valid}
              aria-describedby="channel-name-hint"
              className={cn(field, 'mt-1')}
              placeholder="literature-review"
            />
            <span
              id="channel-name-hint"
              className="mt-1 block text-[11.5px] text-tx3"
            >
              Lowercase letters, numbers, - and _.
            </span>
          </label>
          <label className="text-ctl">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className={cn(field, 'mt-1')}
            />
          </label>
          <div className="text-ctl">
            <span className="mb-1 block">Access</span>
            <Segmented
              label="Channel access"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: 'PROJECT', label: 'Project members' },
                { value: 'RESTRICTED', label: 'Restricted' },
              ]}
            />
          </div>
          {error ? (
            <p role="alert" className="text-ctl text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" disabled={!valid || busy}>
              {busy ? 'Creating…' : 'Create channel'}
            </Btn>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

export function ChannelSettingsDialog({
  detail,
  projectId,
  actorId,
  open,
  onOpenChange,
  onChanged,
}: {
  detail: ChannelDetailDto;
  projectId: string;
  actorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const c = detail.channel;
  const manage = c.capabilities.includes('channel.manage');
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [people, setPeople] = useState<ParticipantDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !manage || c.visibility !== 'RESTRICTED') return;
    fetchParticipants(projectId)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [open, manage, c.visibility, projectId]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const memberIds = new Set(detail.members.map((m) => m.id));
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-32px))] flex-col overflow-auto rounded-2xl p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          #{c.name} settings
        </ModalTitle>
        <ModalDescription className="mb-4 text-ctl text-tx2">
          {c.visibility === 'RESTRICTED'
            ? 'Restricted channel: only listed members can read it.'
            : 'Visible to everyone who can read this project.'}
          {c.archived
            ? ' Archived: history stays readable, new messages are disabled.'
            : ''}
        </ModalDescription>
        {manage && !c.archived ? (
          <form
            className="mb-4 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                communicate({
                  command: 'channel.update',
                  id: c.id,
                  expectedVersion: c.version,
                  ...(name !== c.name ? { name } : {}),
                  description,
                }),
              );
            }}
          >
            <label className="text-ctl">
              Name
              <input
                value={name}
                onChange={(e) =>
                  setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                }
                maxLength={80}
                className={cn(field, 'mt-1')}
              />
            </label>
            <label className="text-ctl">
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className={cn(field, 'mt-1')}
              />
            </label>
            <Btn
              type="submit"
              variant="secondary"
              className="self-end"
              disabled={busy || !CHANNEL_NAME.test(name)}
            >
              Save changes
            </Btn>
          </form>
        ) : null}
        {c.joined ? (
          <div className="mb-4">
            <span className="mb-1 block text-ctl">Notifications</span>
            <Segmented
              label="Channel notifications"
              value={c.notify ?? 'ALL'}
              onChange={(notify) =>
                void run(() =>
                  communicate({
                    command: 'channel.preferences',
                    id: c.id,
                    notify,
                  }),
                )
              }
              options={[
                { value: 'ALL', label: 'Mentions & replies' },
                { value: 'MENTIONS', label: 'Mentions' },
                { value: 'NONE', label: 'Muted' },
              ]}
            />
          </div>
        ) : null}
        <h3 className="mb-1.5 text-ctl font-medium">
          {c.visibility === 'RESTRICTED' ? 'Members' : 'Joined'} ·{' '}
          {detail.members.length}
        </h3>
        <ul className="mb-3 flex flex-col gap-1">
          {detail.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-ctl">
              <span className={cn('flex-1', !m.active && 'text-tx3')}>
                {m.name ?? 'Former member (no project access)'}
                {m.role === 'MANAGER' ? (
                  <span className="ml-1.5 text-[11px] text-tx3">Manager</span>
                ) : null}
              </span>
              {manage && m.id !== actorId && c.visibility === 'RESTRICTED' ? (
                <Btn
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      communicate({
                        command: 'channel.member.remove',
                        id: c.id,
                        profileId: m.id,
                      }),
                    )
                  }
                >
                  Remove
                </Btn>
              ) : null}
            </li>
          ))}
        </ul>
        {manage && c.visibility === 'RESTRICTED' && !c.archived ? (
          <div className="mb-4">
            <h3 className="mb-1.5 text-ctl font-medium">Add project member</h3>
            <ul className="flex flex-col gap-1">
              {people
                .filter((p) => !memberIds.has(p.id))
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-ctl">
                    <span className="flex-1">{p.name}</span>
                    <Btn
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          communicate({
                            command: 'channel.member.add',
                            id: c.id,
                            profileId: p.id,
                          }),
                        )
                      }
                    >
                      Add
                    </Btn>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mb-2 text-ctl text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap justify-end gap-2">
          {c.joined ? (
            <Btn
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  communicate({ command: 'channel.leave', id: c.id }),
                )
              }
            >
              Leave channel
            </Btn>
          ) : null}
          {manage ? (
            <Btn
              variant={c.archived ? 'secondary' : 'danger'}
              disabled={busy}
              onClick={() => {
                if (
                  !c.archived &&
                  !window.confirm(
                    `Archive #${c.name}? History stays readable; nobody can post until it is restored.`,
                  )
                )
                  return;
                void run(() =>
                  communicate({
                    command: c.archived ? 'channel.restore' : 'channel.archive',
                    id: c.id,
                    expectedVersion: c.version,
                  }),
                );
              }}
            >
              {c.archived ? 'Restore channel' : 'Archive channel'}
            </Btn>
          ) : null}
          <Btn onClick={() => onOpenChange(false)}>Close</Btn>
        </div>
      </ModalContent>
    </Modal>
  );
}

const kindIcon = { PAPER: BookOpen, DOCUMENT: FileText, TASK: ListTodo };
interface Option {
  artifactId: string;
  id: string;
  kind: ArtifactKind;
  title: string;
}
/**
 * Picks an existing, authorized research artifact of this project. Precise
 * citations offer only READY source versions and PROJECT-visible annotations;
 * private annotations are listed as unshareable rather than hidden silently.
 */
export function ShareResearchDialog({
  projectId,
  open,
  onOpenChange,
  onPick,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (share: ShareDraft) => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'ALL' | ArtifactKind>('ALL');
  const [items, setItems] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [paper, setPaper] = useState<Option | null>(null);
  const [passages, setPassages] = useState<
    | {
        sourceVersionId: string;
        annotationId: string | null;
        page: number | null;
        quote: string | null;
        shareable: boolean;
      }[]
    | null
  >(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchOptions(projectId, q, kind === 'ALL' ? undefined : kind)
        .then((r) => alive && setItems(r.items))
        .catch((e: unknown) => alive && setError(errorText(e)));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, projectId, q, kind]);
  const openPassages = async (option: Option) => {
    setPaper(option);
    setPassages(null);
    try {
      const detail = await fetchPaper(option.id);
      const ready = detail.sources.filter((s) => s.state === 'READY');
      const found: NonNullable<typeof passages> = [];
      for (const source of ready) {
        found.push({
          sourceVersionId: source.id,
          annotationId: null,
          page: null,
          quote: null,
          shareable: true,
        });
        for (const a of await fetchAnnotations(source.id))
          found.push({
            sourceVersionId: source.id,
            annotationId: a.id,
            page: a.anchor.pageNumber,
            quote: a.anchor.quote ?? a.body,
            shareable: a.visibility === 'PROJECT',
          });
      }
      setPassages(found);
    } catch (e) {
      setError(errorText(e));
      setPassages([]);
    }
  };
  const close = (next: boolean) => {
    if (!next) {
      setPaper(null);
      setPassages(null);
    }
    onOpenChange(next);
  };
  return (
    <Modal open={open} onOpenChange={close}>
      <ModalContent className="flex max-h-[calc(100vh-48px)] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          Share research
        </ModalTitle>
        <ModalDescription className="mb-3 text-ctl text-tx2">
          Shares a typed link. Recipients see it only if they can open the
          original themselves; sharing grants no access.
        </ModalDescription>
        {paper && passages ? (
          <div className="flex min-h-0 flex-col">
            <p className="mb-2 font-serif text-[15px] tracking-[-0.02em]">
              {paper.title}
            </p>
            <ul className="min-h-0 flex-1 overflow-auto rounded-lg border border-bd2 p-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onPick({
                      reference: { artifactId: paper.artifactId },
                      label: paper.title,
                    });
                    close(false);
                  }}
                  className="w-full rounded-md px-2.5 py-2 text-left text-ctl hover:bg-hov"
                >
                  Share the paper
                </button>
              </li>
              {passages.map((p, i) => (
                <li key={`${p.sourceVersionId}-${p.annotationId ?? 'v'}-${i}`}>
                  <button
                    type="button"
                    disabled={!p.shareable}
                    onClick={() => {
                      onPick({
                        reference: {
                          artifactId: paper.artifactId,
                          sourceVersionId: p.sourceVersionId,
                          ...(p.annotationId
                            ? { annotationId: p.annotationId }
                            : {}),
                        },
                        label: p.annotationId
                          ? `${paper.title} · p. ${p.page}`
                          : `${paper.title} · source PDF`,
                      });
                      close(false);
                    }}
                    className="flex w-full gap-2 rounded-md px-2.5 py-2 text-left text-ctl hover:bg-hov disabled:opacity-60"
                  >
                    {p.annotationId ? (
                      p.shareable ? (
                        <Quote
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                      ) : (
                        <Lock
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                      )
                    ) : (
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                    )}
                    <span>
                      {p.annotationId
                        ? `p. ${p.page}${p.quote ? ` — “${p.quote.slice(0, 140)}”` : ''}`
                        : 'Cite the accepted PDF version'}
                      {!p.shareable ? (
                        <span className="block text-[11.5px] text-tx3">
                          Private annotation — make it project-visible to share
                          it.
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Btn className="mt-3 self-start" onClick={() => setPaper(null)}>
              Back
            </Btn>
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              <input
                aria-label="Search this project’s research"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search papers, notes and tasks…"
                className={cn(field, 'min-w-[200px] flex-1')}
                autoFocus
              />
              <Segmented
                label="Artifact type"
                size="sm"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'PAPER', label: 'Papers' },
                  { value: 'DOCUMENT', label: 'Notes' },
                  { value: 'TASK', label: 'Tasks' },
                ]}
              />
            </div>
            {error ? (
              <p role="alert" className="text-ctl text-danger">
                {error}
              </p>
            ) : null}
            <ul
              aria-label="Shareable research"
              className="min-h-[120px] flex-1 overflow-auto rounded-lg border border-bd2 p-1"
            >
              {items.length === 0 ? (
                <li className="p-3 text-ctl text-tx3">
                  No matching active research in this project.
                </li>
              ) : null}
              {items.map((item) => {
                const Icon = kindIcon[item.kind];
                return (
                  <li key={item.artifactId} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onPick({
                          reference: { artifactId: item.artifactId },
                          label: item.title,
                        });
                        close(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-ctl hover:bg-hov"
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-tx3"
                      />
                      <span className="truncate">{item.title}</span>
                    </button>
                    {item.kind === 'PAPER' ? (
                      <Btn size="sm" onClick={() => void openPassages(item)}>
                        Cite passage
                      </Btn>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/**
 * Explicit, audited recovery of a restricted channel that no manager can
 * still manage (A04.1). Owners appoint an existing eligible member; only if
 * they choose themself do they gain access, and that is shown and audited.
 */
export function RecoverChannelDialog({
  channel,
  actorId,
  onOpenChange,
  onRecovered,
}: {
  channel: RecoverableChannelDto | null;
  actorId: string | null;
  onOpenChange: (open: boolean) => void;
  onRecovered: (id: string, self: boolean) => void;
}) {
  const options = [
    ...(channel?.eligible ?? []).map((p) => ({
      id: p.id,
      label: p.name ?? 'Former participant',
    })),
    ...(actorId && !channel?.eligible.some((p) => p.id === actorId)
      ? [{ id: actorId, label: 'Me (grants me access to this channel)' }]
      : []),
  ];
  const [chosen, setChosen] = useState(options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal open={!!channel} onOpenChange={onOpenChange}>
      <ModalContent className="w-[min(460px,calc(100vw-32px))] rounded-2xl p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          Appoint a manager for #{channel?.name}
        </ModalTitle>
        <ModalDescription className="mb-4 text-ctl text-tx2">
          No manager of this restricted channel can manage it any more. As
          project owner you can appoint a new manager. This is recorded in the
          audit log and the appointee is notified. Choosing yourself gives you
          access to the channel&apos;s history.
        </ModalDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!channel || !chosen) return;
            setBusy(true);
            setError('');
            try {
              await communicate({
                command: 'channel.recover',
                id: channel.id,
                profileId: chosen,
              });
              onRecovered(channel.id, chosen === actorId);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-ctl">
            New manager
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              className={cn(field, 'mt-1')}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p role="alert" className="text-ctl text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" disabled={!chosen || busy}>
              {busy ? 'Appointing…' : 'Appoint manager'}
            </Btn>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
