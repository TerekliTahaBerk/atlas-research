'use client';
import { createContext, useContext } from 'react';
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { FileText, ListTodo, Quote } from 'lucide-react';
import type { ReferenceDto } from '@atlas/core';

/*
 * Live (Phase 04) reference atoms. They store only stable typed identity —
 * never a trusted title. Views render the server's current, authorized
 * resolution; anything missing, archived or inaccessible renders a neutral
 * unavailable state without the stored label.
 */
export interface LiveRefs {
  projectId: string;
  /** Resolved references by entity ID (paper, document or task). */
  references: Map<string, ReferenceDto>;
  people: Map<string, string>;
  open: (href: string) => void;
}
export const LiveRefsContext = createContext<LiveRefs>({
  projectId: '',
  references: new Map(),
  people: new Map(),
  open: () => {},
});
const useRefs = () => useContext(LiveRefsContext);

const chip =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-xs border px-1.5 py-px align-baseline font-sans text-xs';
function Unavailable({ kind }: { kind: string }) {
  return (
    <span
      className={`${chip} border-dashed border-bd2 text-tx3`}
      title="This reference is archived, removed or not available to you."
    >
      Unavailable {kind}
    </span>
  );
}

function CitationView({ node }: ReactNodeViewProps) {
  const refs = useRefs();
  const ref = refs.references.get(String(node.attrs.projectPaperId ?? ''));
  if (!ref || ref.state === 'UNAVAILABLE' || !ref.title)
    return (
      <NodeViewWrapper as="span" className="mx-px">
        <Unavailable kind="source" />
      </NodeViewWrapper>
    );
  const page = typeof node.attrs.page === 'number' ? node.attrs.page : null;
  const href =
    node.attrs.sourceVersionId && page
      ? `/app/projects/${refs.projectId}/reader?paper=${ref.id}&source=${String(node.attrs.sourceVersionId)}&page=${page}`
      : ref.href;
  const label = `${ref.detail ?? ref.title}${page ? `, p. ${page}` : ''}`;
  return (
    <NodeViewWrapper as="span" className="mx-px">
      <button
        type="button"
        title={
          node.attrs.quote
            ? `“${String(node.attrs.quote)}” — ${ref.title}`
            : ref.title
        }
        aria-label={`Citation: ${label}${ref.state === 'ARCHIVED' ? ' (archived)' : ''} — open source`}
        onClick={() => href && refs.open(href)}
        className="cursor-pointer whitespace-nowrap rounded-xs bg-acs px-1.5 py-px align-baseline font-sans text-xs text-actx hover:bg-aiin"
      >
        {node.attrs.quote ? (
          <Quote aria-hidden="true" className="mr-1 inline size-[10px]" />
        ) : null}
        {label}
        {ref.state === 'ARCHIVED' ? ' · archived' : ''}
      </button>
    </NodeViewWrapper>
  );
}
function EntityView({
  node,
  kind,
}: ReactNodeViewProps & { kind: 'document' | 'task' }) {
  const refs = useRefs();
  const ref = refs.references.get(
    String((kind === 'task' ? node.attrs.taskId : node.attrs.documentId) ?? ''),
  );
  if (!ref || ref.state === 'UNAVAILABLE' || !ref.title)
    return (
      <NodeViewWrapper as="span">
        <Unavailable kind={kind} />
      </NodeViewWrapper>
    );
  const Icon = kind === 'task' ? ListTodo : FileText;
  return (
    <NodeViewWrapper as="span">
      <button
        type="button"
        onClick={() => ref.href && refs.open(ref.href)}
        className={`${chip} border-bd2 bg-el text-tx2 hover:bg-hov hover:text-tx`}
      >
        <Icon aria-hidden="true" className="size-[11px]" />
        {kind === 'task' ? `${ref.detail} ` : ''}
        <span className="max-w-[260px] truncate">{ref.title}</span>
        {ref.state === 'ARCHIVED' ? (
          <span className="text-tx3">· archived</span>
        ) : null}
      </button>
    </NodeViewWrapper>
  );
}
function MentionView({ node }: ReactNodeViewProps) {
  const refs = useRefs();
  const name = refs.people.get(String(node.attrs.profileId ?? ''));
  return (
    <NodeViewWrapper
      as="span"
      className={
        name
          ? 'rounded-[3px] bg-acs px-[3px] font-sans text-[0.85em] text-actx'
          : 'rounded-[3px] border border-dashed border-bd2 px-[3px] font-sans text-[0.85em] text-tx3'
      }
    >
      @{name ?? 'unavailable person'}
    </NodeViewWrapper>
  );
}

const nullAttrs = (names: string[]) =>
  Object.fromEntries(names.map((n) => [n, { default: null }]));
function atom(
  name: string,
  tag: string,
  attrs: string[],
  view: (props: ReactNodeViewProps) => React.ReactNode,
) {
  return Node.create({
    name,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return nullAttrs(attrs);
    },
    // Pasted HTML never becomes a trusted reference: these tags are not parsed.
    parseHTML() {
      return [];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        tag,
        mergeAttributes({
          'data-type': name,
          'data-id': HTMLAttributes[attrs[0]!],
        }),
      ];
    },
    renderText() {
      return '';
    },
    addNodeView() {
      return ReactNodeViewRenderer(view, { as: 'span' });
    },
  });
}
export const LiveCitation = atom(
  'citation',
  'atlas-citation',
  [
    'projectPaperId',
    'sourceVersionId',
    'annotationId',
    'chunkId',
    'page',
    'quote',
    'startOffset',
    'endOffset',
    'sourceChecksum',
    'label',
  ],
  CitationView,
);
export const LiveDocumentRef = atom(
  'documentRef',
  'atlas-document',
  ['documentId', 'label'],
  (p) => <EntityView {...p} kind="document" />,
);
export const LiveTaskRef = atom(
  'taskRef',
  'atlas-task',
  ['taskId', 'label'],
  (p) => <EntityView {...p} kind="task" />,
);
export const LivePersonMention = atom(
  'personMention',
  'atlas-mention',
  ['profileId', 'label'],
  MentionView,
);
