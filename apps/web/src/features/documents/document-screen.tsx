'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  ChevronDown,
  Bold,
  Italic,
  List,
  Heading2,
  Maximize2,
  Minimize2,
  Sparkles,
  Folder,
  Link2,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Input } from '@atlas/ui/components/input';
import { PageHeader } from '@/components/page-header';
import { documentSamples } from '@/features/preview/fixtures';
import {
  PreviewNotice,
  CreatePreview,
  CapabilityButton,
} from '@/features/preview/primitives';
import {
  EntityPicker,
  useEntityPicker,
} from '@/features/atlas-ai/entity-picker';
import { ContextChip } from '@/features/atlas-ai/context-chip';
import { type ContextReference } from '@/features/atlas-ai/contracts';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
export function DocumentScreen() {
  const params = useSearchParams();
  const initial =
    documentSamples.find((doc) => doc.id === params.get('note')) ??
    documentSamples[0];
  const [active, setActive] = useState<string>(initial.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [selection, setSelection] = useState('');
  const [references, setReferences] = useState<ContextReference[]>([]);
  const [search, setSearch] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const { openAssistant } = useAtlas();
  const sample =
    documentSamples.find((doc) => doc.id === active) ?? documentSamples[0];
  const title = titles[active] ?? sample.title;
  const value = drafts[active] ?? sample.body;
  const dirty =
    Object.keys(drafts).length > 0 || Object.keys(titles).length > 0;
  useEffect(() => {
    if (!dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);
  const picker = useEntityPicker({
    value,
    onChange: (next) => setDrafts((prev) => ({ ...prev, [active]: next })),
    context: 'document',
    onAttach: (ref) =>
      setReferences((prev) =>
        prev.some((r) => r.id === ref.id) ? prev : [...prev, ref],
      ),
  });
  function format(prefix: string, suffix = '') {
    const node = editor.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const next = `${value.slice(0, start)}${prefix}${value.slice(start, end)}${suffix}${value.slice(end)}`;
    setDrafts((prev) => ({ ...prev, [active]: next }));
    node.focus();
    requestAnimationFrame(() =>
      node.setSelectionRange(start + prefix.length, end + prefix.length),
    );
  }
  function ask() {
    openAssistant({
      context: 'document',
      references: [
        { id: active, kind: 'document', title },
        ...(selection
          ? [
              {
                id: 'selected-text',
                kind: 'selection' as const,
                title: selection.slice(0, 90),
              },
            ]
          : []),
      ],
    });
  }
  return (
    <div
      className={focus ? 'document-screen document-focus' : 'document-screen'}
    >
      <div className="module-heading-row">
        <PageHeader
          title="Documents"
          description="A little room to think, connect, and write."
        />
        <CreatePreview />
      </div>
      <PreviewNotice phase="04">
        Local notebook demo · edits stay in memory and are lost on reload. No
        autosave or collaboration service.
      </PreviewNotice>
      <div className="notebook-layout">
        {!focus ? (
          <aside className="document-tree" aria-label="Document tree">
            <Input
              aria-label="Filter documents"
              placeholder="Find a note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="folder-toggle"
              aria-expanded={treeOpen}
              onClick={() => setTreeOpen((prev) => !prev)}
            >
              <ChevronDown aria-hidden="true" />
              <Folder aria-hidden="true" />
              Project notes
            </button>
            {treeOpen
              ? documentSamples
                  .filter((doc) =>
                    doc.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((doc) => (
                    <button
                      key={doc.id}
                      aria-current={active === doc.id ? 'page' : undefined}
                      onClick={() => {
                        setActive(doc.id);
                        setSelection('');
                      }}
                    >
                      <FileText aria-hidden="true" />
                      {titles[doc.id] ?? doc.title}
                    </button>
                  ))
              : null}
            <p className="metadata">
              2 sample notes · private data unavailable
            </p>
          </aside>
        ) : null}
        <section className="writing-surface" aria-label="Local document editor">
          <div
            className="editor-toolbar"
            role="toolbar"
            aria-label="Formatting"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Bold selection"
              onClick={() => format('**', '**')}
            >
              <Bold aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Italic selection"
              onClick={() => format('_', '_')}
            >
              <Italic aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Heading"
              onClick={() => format('\n## ')}
            >
              <Heading2 aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="List"
              onClick={() => format('\n- ')}
            >
              <List aria-hidden="true" />
            </Button>
            <span className="toolbar-spacer" />
            <Button variant="ghost" size="sm" onClick={ask}>
              <Sparkles data-icon="inline-start" />
              Ask Atlas
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={focus ? 'Exit focus mode' : 'Enter focus mode'}
              aria-pressed={focus}
              onClick={() => setFocus((prev) => !prev)}
            >
              {focus ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
            </Button>
          </div>
          <div className="document-page">
            <p className="metadata">SAMPLE PROJECT / NOTES</p>
            <label className="sr-only" htmlFor="document-title">
              Document title
            </label>
            <input
              className="document-title"
              id="document-title"
              maxLength={240}
              value={title}
              onChange={(e) =>
                setTitles((prev) => ({ ...prev, [active]: e.target.value }))
              }
            />
            <p className="metadata">
              Local draft · {value.trim().split(/\s+/).filter(Boolean).length}{' '}
              words · plain text with Markdown markers
            </p>
            <div className="context-chips">
              {references.map((ref) => (
                <ContextChip
                  key={ref.id}
                  reference={ref}
                  onRemove={() =>
                    setReferences((prev) => prev.filter((r) => r.id !== ref.id))
                  }
                />
              ))}
            </div>
            {selection ? (
              <div className="selection-actions">
                <span>{selection.length} characters selected</span>
                <Button variant="secondary" size="sm" onClick={ask}>
                  <Sparkles data-icon="inline-start" />
                  Ask about selection
                </Button>
              </div>
            ) : null}
            <div className="editor-input-region">
              <textarea
                ref={editor}
                className="document-editor"
                aria-label="Document body"
                value={value}
                {...picker.inputProps}
                onChange={(e) => picker.change(e.target.value)}
                onKeyDown={picker.onKeyDown}
                onSelect={(e) =>
                  setSelection(
                    e.currentTarget.value.slice(
                      e.currentTarget.selectionStart,
                      e.currentTarget.selectionEnd,
                    ),
                  )
                }
              />
              <EntityPicker picker={picker} />
            </div>
            <div className="note-footer">
              <span>Type @ for references or / for commands</span>
              <CapabilityButton title="Share document" phase="04">
                <Link2 data-icon="inline-start" />
                Share
              </CapabilityButton>
            </div>
            {dirty ? (
              <p role="status" className="local-draft-warning">
                Unsaved local changes. Switching notes keeps them for this
                visit; leaving this page discards them.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
