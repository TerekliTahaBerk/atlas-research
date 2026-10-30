'use client';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import {
  BookOpen,
  Bold,
  CheckSquare,
  Code,
  FileText,
  Heading2,
  Minus,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListPlus,
  ListTodo,
  MessageSquarePlus,
  Quote,
  Sigma,
  Sparkles,
  Type,
  User,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Portal } from 'radix-ui';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { usePreviewStore } from '@/features/shell/preview-store';
import { people } from '@/lib/preview/people';
import { papers } from '@/lib/preview/research';
import { tasks } from '@/lib/preview/workspace';
import type {
  AnnotationDto,
  ArtifactOption,
  ParticipantDto,
} from '@atlas/core';
import { fetchAnnotations, fetchPaper } from '@/features/library/client';
import { readySource } from '@/features/library/paper-format';
import {
  LiveCitation,
  LiveDocumentRef,
  LivePersonMention,
  LiveTaskRef,
} from './live-nodes';
import {
  AISuggestion,
  Citation,
  CommentCount,
  CommentMark,
  PersonMention,
  Presence,
  TaskRef,
  TrackedChange,
} from './nodes';
type MenuKind = 'slash' | 'mention' | 'cite';
/**
 * Live (Phase 04) editing: real persistence callbacks, authorized reference
 * search and schema-v1 extensions. Without it the editor is the in-memory
 * design preview.
 */
export interface LiveEditorConfig {
  editable: boolean;
  onChange: (content: JSONContent) => void;
  onSave: () => void;
  search: (
    query: string,
    kind?: 'PAPER' | 'DOCUMENT' | 'TASK' | 'PERSON',
  ) => Promise<{ items: ArtifactOption[]; people: ParticipantDto[] }>;
  /** Records a server-provided option so its chip renders before reload. */
  remember: (option: ArtifactOption) => void;
  rememberPerson: (person: ParticipantDto) => void;
  /** Hands selected text to Atlas as a visible, user-editable prompt draft. */
  askAbout: (selection: string) => void;
}
const liveExtensions = () => [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // Appending an empty paragraph on load would create revisions nobody wrote.
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ['mailto'],
      defaultProtocol: 'https',
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({
    placeholder:
      'Type / for commands, @ to reference a paper, document, task or person…',
    showOnlyCurrent: false,
  }),
  LiveCitation,
  LiveDocumentRef,
  LiveTaskRef,
  LivePersonMention,
];
const safeLink = (value: string) => {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:', 'mailto:'].includes(url.protocol) && !/\s/.test(value)
    );
  } catch {
    return false;
  }
};
interface MenuState {
  kind: MenuKind;
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
}
interface MenuItem {
  id: string;
  label: string;
  sub?: string;
  icon: typeof Type;
  group: string;
  tone?: 'ai';
  run: (editor: Editor) => void;
}
function countWords(editor: Editor) {
  return editor.state.doc
    .textBetween(0, editor.state.doc.content.size, ' ', ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}
const SLASH = /(?:^|\s)\/([\w-]*)$/;
const MENTION = /(?:^|\s)@([\w\-#ğüşöçıİ]*)$/i;
/**
 * Atlas document editor (Tiptap). Local, in-memory editing only: content is
 * never persisted or sent. `/` opens block commands, `@` inserts structured
 * references, and the selection toolbar hands text to Atlas.
 */
export function DocEditor({
  content,
  onWords,
  onDirty,
  onOpenComments,
  flash,
  live,
}: {
  live?: LiveEditorConfig;
  content: JSONContent;
  onWords: (words: number) => void;
  onDirty: () => void;
  onOpenComments: () => void;
  flash: (message: string, tone?: 'done' | 'info') => void;
}) {
  const atlas = useAtlas();
  const store = usePreviewStore();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [citeQuery, setCiteQuery] = useState('');
  const keyHandler = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const listId = useId();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const [options, setOptions] = useState<{
    key: string;
    items: ArtifactOption[];
    people: ParticipantDto[];
  } | null>(null);
  const [passages, setPassages] = useState<{
    paper: ArtifactOption;
    sourceVersionId: string;
    sha256: string | null;
    items: AnnotationDto[];
  } | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: live?.editable ?? true,
    extensions: live
      ? liveExtensions()
      : [
          StarterKit.configure({ link: false, heading: { levels: [2, 3] } }),
          Placeholder.configure({
            placeholder: 'Type / for commands, @ to reference a paper or task…',
            showOnlyCurrent: false,
          }),
          Citation,
          TaskRef,
          PersonMention,
          CommentMark,
          CommentCount,
          TrackedChange,
          Presence,
          AISuggestion,
        ],
    content,
    editorProps: {
      attributes: {
        class: 'atlas-prose',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body',
      },
      handleKeyDown: (_view, event) => {
        if (
          liveRef.current &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          liveRef.current.onSave();
          return true;
        }
        return keyHandler.current(event);
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('mark[data-comment]')) {
          onOpenComments();
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: e }) => onWords(countWords(e)),
    onUpdate: ({ editor: e }) => {
      onDirty();
      onWords(countWords(e));
      liveRef.current?.onChange(e.getJSON());
    },
  });
  // Tiptap's React options update preserves the current editable state;
  // apply live recovery locks explicitly without rebuilding the editor.
  const editable = live?.editable;
  useLayoutEffect(() => {
    if (editable !== undefined && editor) editor.setEditable(editable, false);
  }, [editor, editable]);
  const place = useCallback(
    (kind: MenuKind, from: number, to: number, query: string) => {
      if (!editor) return;
      const at = editor.view.coordsAtPos(from);
      setMenu({
        kind,
        query,
        from,
        to,
        top: at.bottom + 6,
        left: at.left,
      });
      setIndex(0);
    },
    [editor],
  );
  // Detect a trailing "/" or "@" token at the caret.
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      const { $from, empty } = editor.state.selection;
      if (!empty) {
        setMenu((m) => (m && m.kind !== 'cite' ? null : m));
        return;
      }
      const before = $from.parent.textBetween(
        0,
        $from.parentOffset,
        undefined,
        '￼',
      );
      const slash = before.match(SLASH);
      const mention = before.match(MENTION);
      const token = slash ? `/${slash[1]}` : mention ? `@${mention[1]}` : null;
      if (!token || dismissed === `${$from.pos}:${token}`) {
        setMenu((m) => (m && m.kind !== 'cite' ? null : m));
        return;
      }
      place(
        slash ? 'slash' : 'mention',
        $from.pos - token.length,
        $from.pos,
        token.slice(1),
      );
    };
    editor.on('selectionUpdate', check);
    editor.on('update', check);
    return () => {
      editor.off('selectionUpdate', check);
      editor.off('update', check);
    };
  }, [dismissed, editor, place]);
  const insertCitation = useCallback(
    (paper: string, range?: { from: number; to: number }) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      (range ? chain.deleteRange(range) : chain)
        .insertContent([
          { type: 'citation', attrs: { paper } },
          { type: 'text', text: ' ' },
        ])
        .run();
      const p = papers.find((x) => x.id === paper);
      if (p) {
        store.addDocCite(p.id);
        flash(
          `Cited ${p.short} · added to References in this local draft (refs.bib is not modified)`,
          'done',
        );
      }
    },
    [editor, flash, store],
  );
  const openCite = useCallback(() => {
    if (!editor) return;
    const { to } = editor.state.selection;
    setCiteQuery('');
    place('cite', to, to, '');
  }, [editor, place]);
  // Live: authorized, project-scoped suggestions for the open picker.
  const liveQuery = menu
    ? `${menu.kind}:${menu.kind === 'cite' ? citeQuery : menu.query}`
    : null;
  useEffect(() => {
    if (!live || !menu || menu.kind === 'slash' || !liveQuery) return;
    let active = true;
    const q = menu.kind === 'cite' ? citeQuery : menu.query;
    const timer = setTimeout(() => {
      liveRef.current
        ?.search(q, menu.kind === 'cite' ? 'PAPER' : undefined)
        .then((result) => {
          if (active) setOptions({ key: liveQuery, ...result });
        })
        .catch(() => {
          if (active) setOptions({ key: liveQuery, items: [], people: [] });
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [citeQuery, live, liveQuery, menu]);
  const insertLive = useCallback(
    (nodes: JSONContent[], range?: { from: number; to: number }) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      (range ? chain.deleteRange(range) : chain)
        .insertContent([...nodes, { type: 'text', text: ' ' }])
        .run();
    },
    [editor],
  );
  const citeLive = useCallback(
    async (paper: ArtifactOption, range?: { from: number; to: number }) => {
      live?.remember(paper);
      // Offer verified passages (highlights on the accepted source version).
      try {
        const dto = await fetchPaper(paper.id);
        const source = readySource(dto);
        const highlights = source
          ? (await fetchAnnotations(source.id)).filter((a) => a.anchor.quote)
          : [];
        if (source && highlights.length) {
          setPassages({
            paper,
            sourceVersionId: source.id,
            sha256: source.sha256,
            items: highlights,
          });
          if (range && editor) editor.chain().focus().deleteRange(range).run();
          const { to } = editor?.state.selection ?? { to: 0 };
          setCiteQuery('');
          place('cite', to, to, '');
          return;
        }
      } catch {
        // Fall back to a paper-level citation; nothing is fabricated.
      }
      insertLive(
        [{ type: 'citation', attrs: { projectPaperId: paper.id } }],
        range,
      );
      flash(`Cited ${paper.detail ?? paper.title}`, 'done');
    },
    [editor, flash, insertLive, live, place],
  );
  function liveItems(): MenuItem[] {
    if (!menu || !editor) return [];
    const range = { from: menu.from, to: menu.to };
    const q = (menu.kind === 'cite' ? citeQuery : menu.query).toLowerCase();
    const block = (
      id: string,
      label: string,
      icon: typeof Type,
      run: (e: Editor) => void,
      sub?: string,
    ): MenuItem => ({
      id,
      group: 'Blocks',
      label,
      icon,
      run,
      ...(sub ? { sub } : {}),
    });
    if (menu.kind === 'slash') {
      const all: MenuItem[] = [
        block('text', 'Text', Type, (e) =>
          e.chain().focus().deleteRange(range).setParagraph().run(),
        ),
        block(
          'heading',
          'Heading',
          Heading2,
          (e) =>
            e.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
          '##',
        ),
        block(
          'list',
          'Bulleted list',
          List,
          (e) => e.chain().focus().deleteRange(range).toggleBulletList().run(),
          '-',
        ),
        block(
          'checklist',
          'Checklist',
          CheckSquare,
          (e) => e.chain().focus().deleteRange(range).toggleTaskList().run(),
          '[]',
        ),
        block(
          'quote',
          'Quote',
          Quote,
          (e) => e.chain().focus().deleteRange(range).toggleBlockquote().run(),
          '>',
        ),
        block(
          'code',
          'Code block',
          Code,
          (e) => e.chain().focus().deleteRange(range).toggleCodeBlock().run(),
          '```',
        ),
        block(
          'divider',
          'Divider',
          Minus,
          (e) => e.chain().focus().deleteRange(range).setHorizontalRule().run(),
          '---',
        ),
        {
          id: 'citation',
          group: 'References',
          label: 'Citation',
          sub: 'cite',
          icon: BookOpen,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            setPassages(null);
            openCite();
          },
        },
        {
          id: 'reference',
          group: 'References',
          label: 'Reference',
          sub: '@',
          icon: FileText,
          run: (e) =>
            e.chain().focus().deleteRange(range).insertContent('@').run(),
        },
        {
          id: 'task',
          group: 'References',
          label: 'Task reference',
          sub: '@task',
          icon: ListTodo,
          run: (e) =>
            e.chain().focus().deleteRange(range).insertContent('@#').run(),
        },
        {
          id: 'ask',
          group: 'Atlas',
          tone: 'ai',
          label: 'Ask Atlas',
          sub: 'proposal only',
          icon: Sparkles,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            atlas.ask({ mode: 'open' });
          },
        },
      ];
      return all.filter(
        (b) => !q || b.label.toLowerCase().includes(q) || b.id.includes(q),
      );
    }
    const current = options?.key === liveQuery ? options : null;
    if (menu.kind === 'cite' && passages) {
      const { paper } = passages;
      return [
        {
          id: `paper-${paper.id}`,
          group: paper.detail ?? 'Paper',
          label: 'Cite the whole paper',
          sub: 'no passage',
          icon: BookOpen,
          run: () => {
            setPassages(null);
            insertLive([
              { type: 'citation', attrs: { projectPaperId: paper.id } },
            ]);
          },
        },
        ...passages.items
          .filter((a) => !q || (a.anchor.quote ?? '').toLowerCase().includes(q))
          .map<MenuItem>((a) => ({
            id: a.id,
            group: 'Highlighted passages',
            label: `“${a.anchor.quote}”`,
            sub: `p. ${a.anchor.pageNumber}`,
            icon: Quote,
            run: () => {
              setPassages(null);
              insertLive([
                {
                  type: 'citation',
                  attrs: {
                    projectPaperId: paper.id,
                    sourceVersionId: passages.sourceVersionId,
                    annotationId: a.id,
                    page: a.anchor.pageNumber,
                    quote: a.anchor.quote,
                    startOffset: a.anchor.startOffset,
                    endOffset: a.anchor.endOffset,
                    sourceChecksum: passages.sha256,
                  },
                },
              ]);
              flash(
                `Cited p. ${a.anchor.pageNumber} of ${paper.detail ?? paper.title}`,
                'done',
              );
            },
          })),
      ];
    }
    if (!current) return [];
    const wantTasks = menu.kind === 'mention' && menu.query.startsWith('#');
    const groups: Record<string, string> = {
      PAPER: 'Papers',
      DOCUMENT: 'Documents',
      TASK: 'Tasks',
    };
    const artifacts = current.items
      .filter((o) =>
        menu.kind === 'cite'
          ? o.kind === 'PAPER'
          : !wantTasks || o.kind === 'TASK',
      )
      .map<MenuItem>((o) => ({
        id: o.artifactId,
        group: menu.kind === 'cite' ? 'Project library' : groups[o.kind]!,
        label:
          menu.kind !== 'cite' && o.kind === 'TASK'
            ? `${o.detail} ${o.title}`
            : o.title,
        ...(o.kind === 'PAPER' && o.detail ? { sub: o.detail } : {}),
        icon:
          o.kind === 'PAPER'
            ? BookOpen
            : o.kind === 'TASK'
              ? ListTodo
              : FileText,
        run: () => {
          if (o.kind === 'PAPER') {
            void citeLive(o, menu.kind === 'cite' ? undefined : range);
            return;
          }
          live?.remember(o);
          insertLive(
            [
              o.kind === 'TASK'
                ? { type: 'taskRef', attrs: { taskId: o.id } }
                : { type: 'documentRef', attrs: { documentId: o.id } },
            ],
            range,
          );
        },
      }));
    const people =
      menu.kind === 'mention' && !wantTasks
        ? current.people.map<MenuItem>((person) => ({
            id: person.id,
            group: 'People',
            label: person.name,
            sub: 'no notification',
            icon: User,
            run: () => {
              live?.rememberPerson(person);
              insertLive(
                [{ type: 'personMention', attrs: { profileId: person.id } }],
                range,
              );
            },
          }))
        : [];
    return [...artifacts, ...people];
  }
  const items: MenuItem[] = (() => {
    if (!menu || !editor) return [];
    if (live) return liveItems();
    const q = (menu.kind === 'cite' ? citeQuery : menu.query).toLowerCase();
    const range = { from: menu.from, to: menu.to };
    if (menu.kind === 'slash') {
      const blocks: MenuItem[] = [
        {
          id: 'text',
          group: 'Blocks',
          label: 'Text',
          icon: Type,
          run: (e) => e.chain().focus().deleteRange(range).setParagraph().run(),
        },
        {
          id: 'heading',
          group: 'Blocks',
          label: 'Heading',
          sub: '##',
          icon: Heading2,
          run: (e) =>
            e.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
        },
        {
          id: 'list',
          group: 'Blocks',
          label: 'Bulleted list',
          sub: '-',
          icon: List,
          run: (e) =>
            e.chain().focus().deleteRange(range).toggleBulletList().run(),
        },
        {
          id: 'equation',
          group: 'Blocks',
          label: 'Equation',
          sub: '$$',
          icon: Sigma,
          run: (e) => {
            e.chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: 'text',
                text: 'A = softmax(QKᵀ/√d ⊙ M) V',
                marks: [{ type: 'code' }],
              })
              .run();
            flash(
              'Inserted a plain equation placeholder — math rendering is not in this preview',
            );
          },
        },
        {
          id: 'citation',
          group: 'Blocks',
          label: 'Citation',
          sub: '@',
          icon: Quote,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            openCite();
          },
        },
        {
          id: 'figure',
          group: 'Blocks',
          label: 'Figure',
          icon: Image,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            flash('Figure upload isn’t available in this preview');
          },
        },
        {
          id: 'continue',
          group: 'Atlas',
          tone: 'ai',
          label: 'Continue writing',
          icon: Sparkles,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            atlas.ask({
              prompt: 'Continue writing this section',
              mode: 'open',
            });
          },
        },
        {
          id: 'task',
          group: 'Atlas',
          tone: 'ai',
          label: 'Create task from text',
          icon: ListPlus,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            atlas.ask({
              prompt: '/create-task from this section',
              mode: 'open',
            });
          },
        },
        {
          id: 'paper',
          group: 'Atlas',
          tone: 'ai',
          label: 'Link a paper',
          icon: BookOpen,
          run: (e) => {
            e.chain().focus().deleteRange(range).run();
            openCite();
          },
        },
      ];
      return blocks.filter((b) => !q || b.label.toLowerCase().includes(q));
    }
    if (menu.kind === 'mention') {
      return [
        ...papers.map<MenuItem>((p) => ({
          id: p.id,
          group: 'Papers',
          label: p.short,
          sub: p.venue,
          icon: BookOpen,
          run: () => insertCitation(p.id, range),
        })),
        ...tasks.slice(0, 4).map<MenuItem>((t) => ({
          id: t.id,
          group: 'Tasks',
          label: `${t.id} ${t.title}`,
          icon: ListTodo,
          run: (e) =>
            e
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                { type: 'taskRef', attrs: { task: t.id } },
                { type: 'text', text: ' ' },
              ])
              .run(),
        })),
        ...(['ayse', 'mehmet', 'elif'] as const).map<MenuItem>((id) => ({
          id,
          group: 'People',
          label: people[id].name,
          icon: User,
          run: (e) =>
            e
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: 'personMention',
                  attrs: { person: id, label: people[id].short },
                },
                { type: 'text', text: ' ' },
              ])
              .run(),
        })),
      ].filter((i) => !q || i.label.toLowerCase().includes(q));
    }
    return papers
      .filter((p) => !q || `${p.title} ${p.short}`.toLowerCase().includes(q))
      .map<MenuItem>((p) => ({
        id: p.id,
        group: 'Library',
        label: p.title,
        sub: `${p.short} · ${p.venue}${['p1', 'p2', 'p5', ...store.docCites].includes(p.id) ? ' · cited' : ''}`,
        icon: BookOpen,
        run: () => insertCitation(p.id),
      }));
  })();
  const active = Math.min(index, Math.max(0, items.length - 1));
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !editor) return;
    const position = () => {
      const el = menuRef.current;
      if (!el || menu.from > editor.state.doc.content.size) return;
      const at = editor.view.coordsAtPos(menu.from);
      const box = el.getBoundingClientRect();
      const below = innerHeight - at.bottom - 14;
      const above = at.top - 14;
      const flip = below < box.height && above > below;
      el.style.maxHeight = `${Math.max(80, flip ? above : below)}px`;
      el.style.left = `${Math.max(8, Math.min(at.left, innerWidth - box.width - 8))}px`;
      el.style.top = `${Math.max(8, flip ? at.top - Math.min(box.height, above) - 6 : at.bottom + 6)}px`;
      el.style.visibility = 'visible';
    };
    position();
    // Radix Portal mounts after this component's layout effect.
    const frame = requestAnimationFrame(position);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [editor, menu]);
  useLayoutEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    if (menu && menu.kind !== 'cite') {
      el.setAttribute('aria-controls', listId);
      const item = items[active];
      if (item)
        el.setAttribute('aria-activedescendant', `${listId}-${item.id}`);
      document
        .getElementById(`${listId}-${item?.id}`)
        ?.scrollIntoView({ block: 'nearest' });
    }
    return () => {
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-activedescendant');
    };
  });
  const pick = (item: MenuItem | undefined) => {
    if (!item || !editor) return;
    setMenu(null);
    item.run(editor);
  };
  const close = useCallback(() => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    if (menu && menu.kind !== 'cite')
      setDismissed(
        `${$from.pos}:${menu.kind === 'slash' ? '/' : '@'}${menu.query}`,
      );
    setMenu(null);
  }, [editor, menu]);
  useLayoutEffect(() => {
    keyHandler.current = (event) => {
      if (!menu) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (items.length)
          setIndex(
            (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
              items.length,
          );
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        pick(items[active]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return true;
      }
      return false;
    };
  });
  const { setMenuOpen } = atlas;
  useEffect(() => {
    setMenuOpen(Boolean(menu));
    return () => setMenuOpen(false);
  }, [menu, setMenuOpen]);
  useEffect(() => {
    if (!menu || !editor) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuRef.current?.contains(target) &&
        !editor.view.dom.contains(target)
      )
        close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [close, editor, menu]);
  if (!editor)
    return <div className="atlas-prose min-h-[200px]" aria-busy="true" />;
  return (
    <>
      <BubbleMenu
        editor={editor}
        {...(live && !live.editable ? { shouldShow: () => false } : {})}
        options={{ placement: 'top-end', offset: 8 }}
        className="z-[40] flex items-center gap-0.5 rounded-lg border border-bd bg-pop p-1 font-sans text-ctl shadow-pop"
      >
        <ToolbarBtn
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Link"
          active={live ? editor.isActive('link') : undefined}
          onClick={() => {
            if (!live) {
              flash('Link insertion is UI-only in this preview');
              return;
            }
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const href = window
              .prompt('Link address (https:// or mailto:)')
              ?.trim();
            if (!href) return;
            if (!safeLink(href)) {
              flash('Only http, https and mailto links are allowed');
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange('link')
              .setLink({ href })
              .run();
          }}
        >
          <LinkIcon aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn label="Add citation" onClick={openCite}>
          <Quote aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn label="Comment" onClick={onOpenComments}>
          <MessageSquarePlus aria-hidden="true" />
        </ToolbarBtn>
        <span aria-hidden="true" className="mx-[3px] h-[18px] w-px bg-bd" />
        <button
          type="button"
          onClick={() => {
            const { from, to } = editor.state.selection;
            const selected = editor.state.doc.textBetween(from, to, ' ');
            const excerpt =
              selected.length > 36 ? `${selected.slice(0, 36)}…` : selected;
            if (live) {
              live.askAbout(selected.slice(0, 2000));
              return;
            }
            atlas.ask({
              mode: 'open',
              chips: [
                {
                  id: `sel-${from}-${to}`,
                  kind: 'selection',
                  title: `Selection: “${excerpt}”`,
                },
              ],
            });
            atlas.focusInput();
          }}
          className="flex h-7 items-center gap-1.5 rounded-[5px] px-[9px] font-medium text-actx hover:bg-acs"
        >
          <Sparkles aria-hidden="true" className="size-[13px]" />
          Ask Atlas
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
      <div
        role="toolbar"
        aria-label="Format"
        hidden={live ? !live.editable : undefined}
        className="sticky bottom-0 z-[4] -mx-5 mt-6 flex h-[52px] items-center gap-1 border-t border-bd2 bg-pop px-2 font-sans sm:hidden"
      >
        <ToolbarBtn
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn label="Add citation" onClick={openCite}>
          <Quote aria-hidden="true" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Insert reference"
          onClick={() => editor.chain().focus().insertContent('@').run()}
        >
          <User aria-hidden="true" />
        </ToolbarBtn>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => atlas.ask({ mode: 'panel' })}
          className="flex h-9 items-center gap-1.5 rounded-[9px] border border-aiib bg-aiin px-3 text-ui text-actx"
        >
          <Sparkles aria-hidden="true" className="size-[14px]" />
          Ask
        </button>
      </div>
      {menu ? (
        <Portal.Root>
          <div
            ref={menuRef}
            className={cn(
              'fixed z-[95] max-w-[calc(100vw-16px)] overflow-auto rounded-xl border border-bd bg-pop font-sans text-tx shadow-pop',
              menu.kind === 'cite' ? 'w-[380px]' : 'w-[280px] p-[5px]',
            )}
            style={{ top: menu.top, left: menu.left, visibility: 'hidden' }}
          >
            {menu.kind === 'cite' ? (
              <div className="flex h-10 items-center gap-2 border-b border-bd2 px-3">
                <Quote aria-hidden="true" className="size-[14px] text-actx" />
                <input
                  autoFocus
                  role="combobox"
                  aria-label="Cite a paper from your library"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={
                    items[active] ? `${listId}-${items[active].id}` : undefined
                  }
                  value={citeQuery}
                  onChange={(e) => {
                    setCiteQuery(e.target.value);
                    setIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (keyHandler.current(e.nativeEvent)) e.preventDefault();
                  }}
                  placeholder="Cite a paper from your library…"
                  className="flex-1 text-ui"
                />
                <button
                  type="button"
                  aria-label="Close citation picker"
                  onClick={() => {
                    setMenu(null);
                    editor.commands.focus();
                  }}
                  className="grid size-[22px] place-items-center rounded-sm text-tx3 hover:bg-hov"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </div>
            ) : null}
            <div
              id={listId}
              role="listbox"
              aria-label={
                menu.kind === 'slash'
                  ? 'Block commands'
                  : menu.kind === 'mention'
                    ? 'Insert reference'
                    : 'Library papers'
              }
              className={cn(
                'max-h-[280px] overflow-auto',
                menu.kind === 'cite' && 'p-[5px]',
              )}
            >
              {items.map((item, i) => {
                const header = i === 0 || items[i - 1]?.group !== item.group;
                return (
                  <div key={item.group + item.id}>
                    {header ? (
                      <div
                        aria-hidden="true"
                        className={cn(
                          'px-[9px] pt-1.5 pb-1 text-[11px] text-tx3',
                          i > 0 && 'mt-1 border-t border-bd2 pt-2',
                        )}
                      >
                        {item.group}
                      </div>
                    ) : null}
                    <div
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => pick(item)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-[9px] text-ui',
                        menu.kind === 'cite' ? 'items-start py-[7px]' : 'h-8',
                        i === active && 'bg-hov',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-[22px] shrink-0 place-items-center rounded-[5px] border border-bd',
                          item.tone === 'ai' ? 'text-actx' : 'text-tx2',
                        )}
                      >
                        <item.icon className="size-3" />
                      </span>
                      {menu.kind === 'cite' ? (
                        <span className="min-w-0 flex-1">
                          <span className="block font-serif text-[15px] leading-[1.25]">
                            {item.label}
                          </span>
                          <span className="text-[11.5px] text-tx3">
                            {item.sub}
                          </span>
                        </span>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          {item.sub ? (
                            <span className="font-mono text-[11px] text-tx3">
                              {item.sub}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 ? (
                <p role="status" className="px-2.5 py-2 text-ctl text-tx3">
                  No matches
                </p>
              ) : null}
            </div>
            {menu.kind === 'cite' ? (
              <div className="flex gap-3 border-t border-bd2 px-3 py-[7px] text-[11px] text-tx3">
                <span>↵ insert</span>
                <span>
                  {live ? 'Then pick a passage' : 'Adds to References'}
                </span>
                <span className="flex-1" />
                <span>{live ? 'Project library' : 'Sample library'}</span>
              </div>
            ) : null}
          </div>
        </Portal.Root>
      ) : null}
    </>
  );
}
function ToolbarBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean | undefined;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-[5px] text-tx2 hover:bg-hov hover:text-tx [&_svg]:size-[14px]',
        active && 'bg-hov text-tx',
      )}
    >
      {children}
    </button>
  );
}
