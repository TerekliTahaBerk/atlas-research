'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  FileCode,
  FilePenLine,
  FileText,
  FileUp,
  History,
  ListTodo,
  ListTree,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Avatar, InlineRef } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { PaperHoverCard, useOpenSource } from '@/features/atlas-ai/citations';
import { MoreMenu } from '@/features/overlays/resource-menus';
import { SharePopover } from '@/features/overlays/share-popover';
import { VersionHistoryDialog } from '@/features/overlays/version-history-dialog';
import { moduleHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { people } from '@/lib/preview/people';
import { paperById, type PaperId } from '@/lib/preview/research';
import { documentById } from '@/lib/preview/workspace';
import { DocumentRail, type RailTab } from './document-rail';
import { DocUi } from './editor/doc-context';
import { DocEditor } from './editor/doc-editor';
import { emptyContent, relatedWorkContent } from './editor/sample-content';
const baseRefs: PaperId[] = ['p2', 'p1', 'p5'];
/**
 * Documents (handoff §6 "Document"): centred 740px article, selection
 * toolbar, suggestion block, slash/mention menus and a right rail.
 * Editing is local and in-memory; nothing is saved or synced.
 */
export function DocumentScreen() {
  const params = useSearchParams();
  const docId = params.get('doc') ?? 'd1';
  // Remount per document so each sample starts from its authored state.
  return <DocumentView key={docId} docId={docId} />;
}
function DocumentView({ docId }: { docId: string }) {
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const store = usePreviewStore();
  const openSource = useOpenSource();
  const doc = documentById(docId);
  const rich = docId === 'd1';
  const title = rich
    ? 'Related work — sparse attention in structure prediction'
    : (doc?.title ?? 'Untitled document');
  const { setContext } = atlas;
  useEffect(() => {
    setContext([{ id: docId, kind: 'document', title }]);
  }, [docId, setContext, title]);
  const [mode, setMode] = useState<'edit' | 'suggest'>('edit');
  const [rail, setRail] = useState<RailTab | null>(null);
  const [resolved, setResolved] = useState(false);
  const [history, setHistory] = useState(false);
  const [share, setShare] = useState(false);
  const [words, setWords] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const openComments = useCallback(() => setRail('comments'), []);
  const ui = useMemo(
    () => ({
      commentsResolved: resolved,
      openComments,
      flash,
      openTask: (id: string) => router.push(moduleHref('tasks', `task=${id}`)),
    }),
    [flash, openComments, resolved, router],
  );
  const onDirty = useCallback(() => setDirty(true), []);
  const refs = [
    ...baseRefs,
    ...store.docCites.filter((id) => !baseRefs.includes(id)),
  ];
  const startActions = [
    {
      icon: Sparkles,
      label: 'Ask Atlas',
      run: () => atlas.ask({ mode: 'focus' }),
    },
    {
      icon: BookOpen,
      label: 'Summarize linked papers',
      run: () =>
        atlas.ask({ mode: 'focus', prompt: '/summarize the linked papers' }),
    },
    {
      icon: ListTree,
      label: 'Outline from project tasks',
      run: () =>
        atlas.ask({
          mode: 'focus',
          prompt: 'Outline this note from the project tasks',
        }),
    },
    {
      icon: FileUp,
      label: 'Import notes',
      run: () => flash('Importing notes isn’t available in this preview'),
    },
  ];
  return (
    <DocUi.Provider value={ui}>
      <div className="aic-wide flex min-h-0 flex-1 flex-col">
        <Topbar
          actions={
            <>
              {rich ? (
                <>
                  <span className="mr-0.5 hidden items-center min-[1500px]:flex">
                    <span className="relative">
                      <Avatar
                        person={people.ayse}
                        size={24}
                        title="Ayşe Demir · editing §2 (sample presence)"
                        className="shadow-[0_0_0_2px_var(--bg),0_0_0_3.5px_var(--presence)]"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute -right-px -bottom-px size-2 rounded-full border-2 border-canvas bg-ac"
                      />
                    </span>
                    <Avatar
                      person={people.mehmet}
                      size={24}
                      ring="var(--bg)"
                      className="-ml-1 opacity-75"
                      title="Mehmet Kaya · viewing (sample presence)"
                    />
                  </span>
                  <Segmented
                    label="Editing mode"
                    size="sm"
                    value={mode}
                    onChange={setMode}
                    className="max-md:hidden"
                    options={[
                      {
                        value: 'edit',
                        label: 'Editing',
                        icon: <Pencil aria-hidden="true" className="!size-3" />,
                      },
                      {
                        value: 'suggest',
                        label: 'Suggesting',
                        icon: (
                          <FilePenLine aria-hidden="true" className="!size-3" />
                        ),
                      },
                    ]}
                  />
                </>
              ) : null}
              <button
                type="button"
                aria-label="Comments & links"
                aria-pressed={rail !== null}
                onClick={() => setRail((r) => (r ? null : 'comments'))}
                className={cn(
                  'grid size-7 place-items-center rounded-md hover:bg-hov hover:text-tx',
                  rail ? 'bg-hov text-tx' : 'text-tx2',
                )}
              >
                <MessageSquareText aria-hidden="true" className="size-[15px]" />
              </button>
              <button
                type="button"
                aria-label="Version history"
                onClick={() => setHistory(true)}
                className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
              >
                <History aria-hidden="true" className="size-[15px]" />
              </button>
              <MoreMenu
                onHistory={() => setHistory(true)}
                onManageAccess={() => setShare(true)}
                wordCount={words.toLocaleString('en-US')}
              />
              <SharePopover
                resource={title}
                open={share}
                onOpenChange={setShare}
              />
            </>
          }
        >
          <Crumb parent="Sparse Evoformer" title={title} as="span" />
        </Topbar>
        <AtlasAnchor placement="canvas" reserve="wide" />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-auto">
            <article
              className={cn(
                'relative mx-auto max-w-[740px] px-10 pb-40 max-sm:px-5',
                rich
                  ? 'pt-[calc(68px+var(--aic))]'
                  : 'pt-[calc(88px+var(--aic))]',
              )}
            >
              {mode === 'suggest' ? (
                <div className="mb-[18px] flex animate-atlas-rise items-center gap-2 rounded-lg border border-aiib bg-acs px-3 py-2 text-ctl text-actx">
                  <FilePenLine
                    aria-hidden="true"
                    className="size-[13px] shrink-0"
                  />
                  <span className="flex-1">
                    You’re suggesting. In this preview edits are not tracked or
                    sent to Ayşe and Mehmet.
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="text-xs underline"
                  >
                    Back to editing
                  </button>
                </div>
              ) : null}
              {rich ? (
                <div className="mb-3.5 flex flex-wrap items-center gap-2 text-xs text-tx3">
                  <FileText aria-hidden="true" className="size-[13px]" />
                  {doc?.kind}
                  <span aria-hidden="true">·</span>
                  Edited 12 min ago by Ayşe
                  <span aria-hidden="true">·</span>
                  <span className="flex pl-[5px]">
                    <Avatar
                      person={people.taha}
                      size={18}
                      ring="var(--bg)"
                      className="-ml-[5px]"
                    />
                    <Avatar
                      person={people.ayse}
                      size={18}
                      ring="var(--bg)"
                      className="-ml-[5px]"
                    />
                  </span>
                </div>
              ) : null}
              <h1
                className={cn(
                  'font-serif text-[42px] leading-[1.08] font-medium tracking-[-0.01em] text-balance break-words max-sm:text-[32px]',
                  rich ? 'mb-3.5' : 'mb-[26px]',
                )}
              >
                {title}
              </h1>
              {rich ? (
                <div className="mb-[34px] flex flex-wrap gap-1.5">
                  <InlineRef
                    icon={<BookOpen aria-hidden="true" />}
                    onClick={() => setRail('related')}
                  >
                    3 linked papers
                  </InlineRef>
                  <InlineRef
                    icon={<ListTodo aria-hidden="true" />}
                    onClick={() => setRail('linked')}
                  >
                    ATL-22 · ATL-27
                  </InlineRef>
                  <InlineRef
                    icon={<FileCode aria-hidden="true" />}
                    onClick={() => router.push(moduleHref('manuscripts'))}
                  >
                    Feeds §2 of main.tex
                  </InlineRef>
                </div>
              ) : (
                <>
                  <div className="mb-2 text-xs text-tx3">Start with</div>
                  <div className="mb-[22px] flex flex-wrap gap-2">
                    {startActions.map((a, i) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={a.run}
                        className="inline-flex h-[30px] items-center gap-[7px] rounded-[7px] border border-bd2 bg-el px-[11px] text-ui hover:bg-hov"
                      >
                        <a.icon
                          aria-hidden="true"
                          className={cn(
                            'size-[13px]',
                            i === 0 ? 'text-actx' : 'text-tx2',
                          )}
                        />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <DocEditor
                content={rich ? relatedWorkContent : emptyContent}
                onWords={setWords}
                onDirty={onDirty}
                onOpenComments={openComments}
                flash={flash}
              />
              {rich ? (
                <section
                  aria-label="References"
                  className="mt-12 border-t border-bd2 pt-4 font-sans"
                >
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <h2 className="font-serif text-[22px] font-medium">
                      References
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-xs border border-bd2 px-[7px] py-px text-[11px] text-tx3">
                      <RefreshCw aria-hidden="true" className="size-[10px]" />
                      Linked to main.tex · refs.bib (sample)
                    </span>
                  </div>
                  <ol>
                    {refs.map((id, i) => {
                      const p = paperById(id);
                      return (
                        <li key={id}>
                          <PaperHoverCard paper={id}>
                            <button
                              type="button"
                              onClick={() => openSource(id)}
                              className="flex w-full gap-2.5 py-1.5 text-left text-ui leading-normal text-tx2 hover:text-tx"
                            >
                              <span className="w-[22px] pt-0.5 font-mono text-[11px] text-tx3">
                                [{i + 1}]
                              </span>
                              <span className="flex-1">
                                {p.authors} ({p.year}).{' '}
                                <i className="font-read">{p.title}</i>.{' '}
                                {p.venue}.
                              </span>
                              {!baseRefs.includes(id) ? (
                                <span className="text-[10.5px] text-actx">
                                  New
                                </span>
                              ) : null}
                            </button>
                          </PaperHoverCard>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
            </article>
            <div className="pointer-events-none sticky bottom-3 flex justify-end px-3.5">
              <span className="rounded-sm border border-bd2 bg-canvas px-2 py-[3px] text-[11.5px] text-tx3">
                {dirty ? 'Local draft · not saved' : 'Sample note'} ·{' '}
                {words.toLocaleString('en-US')} words
              </span>
            </div>
          </div>
          {rail ? (
            <DocumentRail
              tab={rail}
              onTab={setRail}
              onClose={() => setRail(null)}
              resolved={resolved}
              onResolve={() => {
                setResolved(true);
                flash(
                  'Thread resolved in this preview · moved to Resolved',
                  'done',
                );
              }}
            />
          ) : null}
        </div>
      </div>
      <VersionHistoryDialog
        open={history}
        onOpenChange={setHistory}
        title={title}
        empty={!rich}
      />
    </DocUi.Provider>
  );
}
