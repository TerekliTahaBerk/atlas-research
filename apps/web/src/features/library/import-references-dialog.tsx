'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { FileUp, Library, Link2Off, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  IMPORT_BATCH,
  personDisplay,
  referenceTypeLabels,
  type ImportItemInput,
  type ImportPreview,
  type InterchangeFormat,
  type PreviewItem,
  type PreviewStatus,
  type ProjectDto,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { ApiError } from './client';
import {
  connectZotero,
  disconnectZotero,
  fetchZoteroCollections,
  fetchZoteroItems,
  fetchZoteroStatus,
  importBatch,
  previewFile,
  previewZotero,
  type ZoteroListItem,
  type ZoteroStatus,
} from './interchange-client';

const statusLabels: Record<PreviewStatus, string> = {
  NEW: 'New',
  EXISTING: 'Already in library',
  ARCHIVED: 'Archived in library',
  POSSIBLE_DUPLICATE: 'Possible duplicate',
  UPDATE_AVAILABLE: 'Update available',
  INVALID: 'Cannot import',
};
/** Selectable by default: only clearly new records. */
const selectable = (s: PreviewStatus) =>
  s === 'NEW' || s === 'POSSIBLE_DUPLICATE' || s === 'UPDATE_AVAILABLE';
const formatOf = (name: string, text: string): InterchangeFormat =>
  /\.json$/i.test(name) || /^\s*[[{]/.test(text)
    ? 'csl-json'
    : /\.ris$/i.test(name) || /^TY {2}- /m.test(text)
      ? 'ris'
      : 'bibtex';
const message = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.code === 'NETWORK'
    ? 'The response was not confirmed. Retrying is safe; nothing is imported twice.'
    : e instanceof Error
      ? e.message
      : fallback;

type Batch = { items: ImportItemInput[]; indexes: number[]; key: string };
type Outcome = {
  created: number;
  existing: number;
  updated: number;
  archived: number;
};

/**
 * Import references. Files and Zotero share one read-only preview; nothing
 * is written until “Import selected”. Batches are idempotent (stable request
 * keys across retries) and partial success is reported per batch.
 */
export function ImportReferencesDialog({
  open,
  onOpenChange,
  project,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto;
  onImported: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ModalContent className="flex h-[min(680px,calc(100vh-48px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl">
          <ImportFlow
            project={project}
            onClose={() => onOpenChange(false)}
            onImported={onImported}
          />
        </ModalContent>
      ) : null}
    </Modal>
  );
}

function ImportFlow({
  project,
  onClose,
  onImported,
}: {
  project: ProjectDto;
  onClose: () => void;
  onImported: () => void;
}) {
  const [source, setSource] = useState<'file' | 'zotero'>('file');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-bd2 px-4 py-3">
        <ModalTitle className="flex-1 text-ui font-medium">
          Import references
        </ModalTitle>
        <IconBtn label="Close" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <ModalDescription className="sr-only">
        Preview BibTeX, RIS, CSL JSON or Zotero references before adding
        selected ones to this project.
      </ModalDescription>
      {preview ? (
        <PreviewStep
          project={project}
          preview={preview}
          onBack={() => setPreview(null)}
          onClose={onClose}
          onImported={onImported}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-bd2 px-4 py-2">
            <Segmented
              label="Import source"
              variant="plain"
              value={source}
              onChange={setSource}
              options={[
                { value: 'file', label: 'BibTeX, RIS or CSL JSON file' },
                { value: 'zotero', label: 'Zotero library' },
              ]}
            />
          </div>
          {source === 'file' ? (
            <FileStep project={project} onPreview={setPreview} />
          ) : (
            <ZoteroStep project={project} onPreview={setPreview} />
          )}
        </div>
      )}
    </>
  );
}

/** UTF-8 text of a local file; FileReader is available in every target browser. */
const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file, 'utf-8');
  });

function FileStep({
  project,
  onPreview,
}: {
  project: ProjectDto;
  onPreview: (p: ImportPreview) => void;
}) {
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function read(file: File) {
    setError('');
    if (file.size > 2_000_000)
      return setError(
        'The file is larger than 2 MB. Split it and import each part.',
      );
    setBusy(true);
    try {
      const text = await readText(file);
      onPreview(await previewFile(project.id, formatOf(file.name, text), text));
    } catch (e) {
      setError(message(e, 'The file could not be read.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex-1 overflow-auto p-4 text-ctl">
      <p className="mb-3 text-tx2">
        Choose a bibliography file. It is read as plain data — LaTeX is never
        executed and no links inside it are opened. You review every record
        before anything is added.
      </p>
      <label
        htmlFor={`${ids}-file`}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-bd p-8 text-center hover:bg-hov focus-within:ring-2 focus-within:ring-ac"
      >
        <FileUp aria-hidden="true" className="size-5 text-tx3" />
        <span className="font-medium">
          {busy ? 'Reading…' : 'Choose a .bib, .ris or .json file'}
        </span>
        <span className="text-[11.5px] text-tx3">
          Up to 2 MB and 2,000 entries
        </span>
        <input
          id={`${ids}-file`}
          type="file"
          accept=".bib,.bibtex,.ris,.json,application/json,text/plain"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void read(file);
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ZoteroStep({
  project,
  onPreview,
}: {
  project: ProjectDto;
  onPreview: (p: ImportPreview) => void;
}) {
  const ids = useId();
  const [status, setStatus] = useState<ZoteroStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [collections, setCollections] = useState<
    { key: string; name: string }[]
  >([]);
  const [collection, setCollection] = useState('');
  const [items, setItems] = useState<ZoteroListItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    fetchZoteroStatus()
      .then((s) => {
        if (!active) return;
        setStatus(s);
        setLibraryId(s.connection?.libraries[0]?.id ?? '');
      })
      .catch(
        (e: unknown) =>
          active && setError(message(e, 'Zotero status is unavailable.')),
      );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!libraryId) return;
    let active = true;
    // The shared provider lease deliberately serializes requests across replicas.
    // Do not race this screen's collections and item reads against that lease.
    async function load() {
      const c = await fetchZoteroCollections(libraryId);
      if (!active) return;
      const i = await fetchZoteroItems(libraryId, collection || null, 0);
      if (!active) return;
      setCollections(c.items);
      setItems(i.items);
      setNext(i.nextStart);
    }
    void load().catch((e: unknown) => {
      if (active) setError(message(e, 'Zotero could not be read.'));
    });
    return () => {
      active = false;
    };
  }, [libraryId, collection, reload]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(message(e, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  }
  if (!status)
    return (
      <p className="p-4 text-ctl text-tx3" role="status">
        {error || 'Checking Zotero connection…'}
      </p>
    );
  if (!status.configured)
    return (
      <p className="p-4 text-ctl text-tx2">
        Zotero connections are not enabled on this Atlas server. You can still
        export a BibTeX, RIS or CSL JSON file from Zotero and import it as a
        file.
      </p>
    );
  if (!status.connection)
    return (
      <form
        className="flex-1 overflow-auto p-4 text-ctl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const s = await connectZotero(apiKey.trim());
            setApiKey('');
            setStatus(s);
            setLibraryId(s.connection?.libraries[0]?.id ?? '');
          });
        }}
      >
        <p className="mb-2 text-tx2">
          Connect your own Zotero library with a <strong>read-only</strong> API
          key created in your Zotero account settings (Settings → Security → API
          keys). Atlas only reads; keys that allow changes are refused.
        </p>
        <ul className="mb-3 list-disc pl-5 text-[11.5px] text-tx3">
          <li>
            The key is stored encrypted and is visible only to you — never to
            project members.
          </li>
          <li>
            Nothing is shared with this project until you import selected items.
          </li>
          <li>PDF attachments are not downloaded.</li>
        </ul>
        <label
          className="mb-1 block text-[11.5px] text-tx3"
          htmlFor={`${ids}-key`}
        >
          Zotero API key
        </label>
        <input
          id={`${ids}-key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          maxLength={100}
          onChange={(e) => setApiKey(e.target.value)}
          className="mb-3 h-8 w-full rounded-[7px] border border-bd bg-canvas px-2.5 font-mono"
        />
        {error ? (
          <p role="alert" className="mb-2 text-danger">
            {error}
          </p>
        ) : null}
        <Btn
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy || !apiKey.trim()}
        >
          {busy ? 'Checking key…' : 'Connect read-only'}
        </Btn>
      </form>
    );
  const toggle = (key: string) =>
    setPicked((list) =>
      list.includes(key)
        ? list.filter((k) => k !== key)
        : [...list, key].slice(0, 50),
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col text-ctl">
      <div className="flex flex-wrap items-end gap-2 border-b border-bd2 px-4 py-2.5">
        <label className="text-[11.5px] text-tx3">
          Library
          <select
            className="mt-1 block h-8 rounded-[7px] border border-bd bg-canvas px-2 text-ctl text-tx"
            value={libraryId}
            onChange={(e) => {
              setItems([]);
              setPicked([]);
              setCollection('');
              setLibraryId(e.target.value);
            }}
          >
            {status.connection.libraries.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11.5px] text-tx3">
          Collection
          <select
            className="mt-1 block h-8 rounded-[7px] border border-bd bg-canvas px-2 text-ctl text-tx"
            value={collection}
            onChange={(e) => {
              setItems([]);
              setPicked([]);
              setCollection(e.target.value);
            }}
          >
            <option value="">All items</option>
            {collections.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        {error ? (
          <Btn
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() => {
              setError('');
              setReload((value) => value + 1);
            }}
          >
            Retry library
          </Btn>
        ) : null}
        <Btn
          variant="ghost"
          size="md"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (
                !window.confirm(
                  'Disconnect Zotero? Atlas deletes its copy of your key. Revoke the key in Zotero too.',
                )
              )
                return;
              setStatus(await disconnectZotero());
            })
          }
        >
          <Link2Off aria-hidden="true" />
          Disconnect
        </Btn>
      </div>
      <ul
        aria-label="Zotero items"
        className="min-h-0 flex-1 overflow-auto px-2 py-1"
      >
        {items.map((item) =>
          item.key ? (
            <li key={item.key}>
              <label
                className={cn(
                  'flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hov',
                  !item.importable && 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={!item.importable}
                  checked={picked.includes(item.key)}
                  onChange={() => toggle(item.key!)}
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    {item.title ?? 'Untitled item'}
                  </span>
                  <span className="block text-[11.5px] text-tx3">
                    {[item.type, item.creators.join(', '), item.year]
                      .filter(Boolean)
                      .join(' · ') || 'No details'}
                  </span>
                </span>
              </label>
            </li>
          ) : null,
        )}
        {!items.length ? (
          <li className="px-2 py-3 text-tx3">
            {error || 'No items in this view.'}
          </li>
        ) : null}
      </ul>
      <div className="flex items-center gap-2 border-t border-bd2 px-4 py-3">
        {next !== null ? (
          <Btn
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const page = await fetchZoteroItems(
                  libraryId,
                  collection || null,
                  next,
                );
                setItems((list) => [...list, ...page.items]);
                setNext(page.nextStart);
              })
            }
          >
            Load more
          </Btn>
        ) : null}
        <span className="flex-1 text-[11.5px] text-tx3" role="status">
          {picked.length} selected (up to 50 per preview)
        </span>
        {error && items.length ? (
          <span className="text-danger">{error}</span>
        ) : null}
        <Btn
          variant="primary"
          size="lg"
          disabled={busy || !picked.length}
          onClick={() =>
            void run(async () =>
              onPreview(await previewZotero(project.id, libraryId, picked)),
            )
          }
        >
          Preview selected
        </Btn>
      </div>
    </div>
  );
}

/**
 * Splits the selection into batches of ≤50 items and ≤400 KB (the command
 * endpoint is bounded). Keys are stable per batch content, so a retry of the
 * same batch replays instead of importing again.
 */
function toBatches(
  preview: ImportPreview,
  indexes: number[],
  keys: Map<string, string>,
): Batch[] {
  const batches: Batch[] = [];
  let current: Batch | null = null;
  let size = 0;
  for (const index of indexes) {
    const p = preview.items.find((i) => i.index === index);
    if (!p?.record) continue;
    const item: ImportItemInput = {
      record: p.record,
      link: p.link,
      atlasId: p.provenance.atlasId,
      update: p.status === 'UPDATE_AVAILABLE',
    };
    const bytes = JSON.stringify(item).length;
    if (
      !current ||
      current.items.length >= IMPORT_BATCH ||
      size + bytes > 400_000
    ) {
      current = { items: [], indexes: [], key: '' };
      batches.push(current);
      size = 0;
    }
    current.items.push(item);
    current.indexes.push(index);
    size += bytes;
  }
  return batches.map((batch) => {
    const signature = batch.indexes.join(',');
    if (!keys.has(signature)) keys.set(signature, crypto.randomUUID());
    return { ...batch, key: keys.get(signature)! };
  });
}

function PreviewStep({
  project,
  preview,
  onBack,
  onClose,
  onImported,
}: {
  project: ProjectDto;
  preview: ImportPreview;
  onBack: () => void;
  onClose: () => void;
  onImported: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(() =>
    preview.items.filter((i) => i.status === 'NEW').map((i) => i.index),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failed, setFailed] = useState<{ batch: Batch; error: string }[]>([]);
  // Stable request keys per batch content: a retry replays, never duplicates.
  const keys = useRef(new Map<string, string>());
  const choosable = preview.items.filter((i) => selectable(i.status));
  async function send(batches: Batch[]) {
    setBusy(true);
    setFailed([]);
    const total: Outcome = {
      created: 0,
      existing: 0,
      updated: 0,
      archived: 0,
      ...outcome,
    };
    const failures: { batch: Batch; error: string }[] = [];
    for (const [n, batch] of batches.entries()) {
      setProgress(`Importing batch ${n + 1} of ${batches.length}…`);
      try {
        const result = await importBatch({
          command: 'reference.import',
          projectId: project.id,
          items: batch.items,
          idempotencyKey: batch.key,
        });
        for (const r of result.results) {
          if (r.outcome === 'CREATED') total.created++;
          else if (r.outcome === 'EXISTING') total.existing++;
          else if (r.outcome === 'UPDATED') total.updated++;
          else total.archived++;
        }
      } catch (e) {
        failures.push({
          batch,
          error: message(e, 'This batch was not imported.'),
        });
      }
    }
    setOutcome({ ...total });
    setFailed(failures);
    setProgress('');
    setBusy(false);
    if (total.created || total.updated) onImported();
  }
  const list = (
    <ul
      aria-label="Records to import"
      className="min-h-0 flex-1 overflow-auto px-2 py-1 text-ctl"
    >
      {preview.items.map((item) => (
        <PreviewRow
          key={item.index}
          item={item}
          checked={selected.includes(item.index)}
          disabled={busy || !!outcome || !selectable(item.status)}
          onToggle={() =>
            setSelected((s) =>
              s.includes(item.index)
                ? s.filter((x) => x !== item.index)
                : [...s, item.index],
            )
          }
        />
      ))}
    </ul>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-wrap items-center gap-1.5 border-b border-bd2 px-4 py-2.5 text-[11.5px]"
        aria-label="Summary"
      >
        <Library aria-hidden="true" className="size-3.5 text-tx3" />
        <span className="mr-1 text-tx2">{preview.items.length} records</span>
        {(Object.entries(preview.counts) as [PreviewStatus, number][])
          .filter(([, n]) => n)
          .map(([s, n]) => (
            <span
              key={s}
              className="rounded-sm border border-bd2 bg-el px-1.5 py-px text-tx2"
            >
              {statusLabels[s]}: {n}
            </span>
          ))}
      </div>
      {preview.issues.length ? (
        <details className="border-b border-bd2 px-4 py-2 text-[11.5px] text-tx2">
          <summary className="cursor-pointer">
            File notes ({preview.issues.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {preview.issues.slice(0, 50).map((issue, i) => (
              <li
                key={i}
                className={
                  issue.severity === 'error' ? 'text-danger' : undefined
                }
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {list}
      <div className="flex flex-wrap items-center gap-2 border-t border-bd2 px-4 py-3 text-ctl">
        {!outcome ? (
          <>
            <Btn
              variant="ghost"
              size="md"
              disabled={busy}
              onClick={() => setSelected(choosable.map((i) => i.index))}
            >
              Select all
            </Btn>
            <Btn
              variant="ghost"
              size="md"
              disabled={busy}
              onClick={() => setSelected([])}
            >
              Select none
            </Btn>
          </>
        ) : null}
        <span
          className="flex-1 text-[11.5px] text-tx2"
          role="status"
          aria-live="polite"
        >
          {progress ||
            (outcome
              ? `Added ${outcome.created}, already in library ${outcome.existing}, updated ${outcome.updated}${outcome.archived ? `, archived (not restored) ${outcome.archived}` : ''}.${failed.length ? ` ${failed.length} batch${failed.length === 1 ? '' : 'es'} failed.` : ''}`
              : `${selected.length} selected`)}
        </span>
        {failed.length ? (
          <>
            <span role="alert" className="w-full text-danger">
              {failed[0]!.error}
            </span>
            <Btn
              variant="primary"
              size="lg"
              disabled={busy}
              onClick={() => void send(failed.map((f) => f.batch))}
            >
              Retry failed
            </Btn>
          </>
        ) : null}
        {outcome && !failed.length ? (
          <Btn variant="primary" size="lg" onClick={onClose}>
            Done
          </Btn>
        ) : !outcome ? (
          <>
            <Btn variant="ghost" size="lg" disabled={busy} onClick={onBack}>
              Back
            </Btn>
            <Btn
              variant="primary"
              size="lg"
              disabled={busy || !selected.length}
              onClick={() =>
                void send(toBatches(preview, selected, keys.current))
              }
            >
              {busy ? 'Importing…' : `Import ${selected.length} selected`}
            </Btn>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PreviewRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: PreviewItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const r = item.record;
  const tone =
    item.status === 'NEW'
      ? 'text-actx'
      : item.status === 'INVALID'
        ? 'text-danger'
        : item.status === 'POSSIBLE_DUPLICATE' ||
            item.status === 'UPDATE_AVAILABLE'
          ? 'text-warn'
          : 'text-tx3';
  return (
    <li className="border-b border-bd2 last:border-0">
      <label
        className={cn(
          'flex items-start gap-2 px-2 py-2',
          disabled && !checked && 'opacity-80',
        )}
      >
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-serif tracking-[-0.02em] text-[15px] leading-[1.25]">
            {r?.title ?? `Entry ${item.provenance.key ?? item.index + 1}`}
          </span>
          {r ? (
            <span className="block text-[11.5px] text-tx3">
              {[
                referenceTypeLabels[r.type] +
                  (r.originalType ? ` (from “${r.originalType}”)` : ''),
                r.authors.slice(0, 3).map(personDisplay).join(', ') +
                  (r.authors.length > 3 ? ' et al.' : ''),
                r.issued?.year,
                r.containerTitle,
                r.doi ? `DOI ${r.doi}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
          <span className={cn('block text-[11.5px]', tone)}>
            {statusLabels[item.status]}
            {item.match
              ? ` — “${item.match.title}”${item.match.by === 'title' ? ' (similar title; review before importing)' : ''}`
              : ''}
            {item.status === 'UPDATE_AVAILABLE'
              ? ' — select to apply the newer Zotero metadata'
              : ''}
          </span>
          {item.issues.length || item.unsupported.length ? (
            <span className="block text-[11px] text-tx3">
              {[
                ...item.issues,
                ...(item.unsupported.length
                  ? [
                      `Not imported fields: ${item.unsupported.slice(0, 8).join(', ')}`,
                    ]
                  : []),
              ].join(' ')}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}
