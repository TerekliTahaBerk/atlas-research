'use client';
import {
  Mark,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from '@tiptap/react';
import {
  Check,
  ListTodo,
  MessageSquare,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { SampleTag } from '@/components/atlas/chips';
import { CitationChip } from '@/features/atlas-ai/citations';
import { isPaperId } from '@/lib/preview/research';
import { useDocUi } from './doc-context';
/*
 * Atlas document schema extensions (Tiptap). Inline references are atoms
 * holding structured ids; their React views render the shared chips.
 */
function CitationView({ node }: ReactNodeViewProps) {
  const id = String(node.attrs.paper ?? '');
  return (
    <NodeViewWrapper as="span" className="mx-px">
      {isPaperId(id) ? <CitationChip paper={id} /> : null}
    </NodeViewWrapper>
  );
}
export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { paper: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'atlas-citation' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-citation', mergeAttributes(HTMLAttributes)];
  },
  renderText({ node }) {
    return `[${String(node.attrs.paper)}]`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: 'span' });
  },
});
function TaskRefView({ node }: ReactNodeViewProps) {
  const ui = useDocUi();
  const id = String(node.attrs.task ?? '');
  return (
    <NodeViewWrapper as="span">
      <button
        type="button"
        onClick={() => ui.openTask(id)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-bd2 bg-el px-1.5 py-px align-baseline font-sans text-xs text-tx2 hover:bg-hov hover:text-tx"
      >
        <ListTodo aria-hidden="true" className="size-[11px]" />
        {id}
      </button>
    </NodeViewWrapper>
  );
}
export const TaskRef = Node.create({
  name: 'taskRef',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { task: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'atlas-task' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-task', mergeAttributes(HTMLAttributes)];
  },
  renderText({ node }) {
    return String(node.attrs.task);
  },
  addNodeView() {
    return ReactNodeViewRenderer(TaskRefView, { as: 'span' });
  },
});
function MentionView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="span"
      className="rounded-[3px] bg-acs px-[3px] font-sans text-[0.85em] text-actx"
    >
      @{String(node.attrs.label)}
    </NodeViewWrapper>
  );
}
export const PersonMention = Node.create({
  name: 'personMention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { person: { default: null }, label: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'atlas-mention' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-mention', mergeAttributes(HTMLAttributes)];
  },
  renderText({ node }) {
    return `@${String(node.attrs.label)}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: 'span' });
  },
});
/** Comment anchor: highlighted text that opens its thread in the rail. */
export const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return { thread: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'mark[data-comment]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'mark',
      mergeAttributes({ 'data-comment': HTMLAttributes.thread ?? 'true' }),
    ];
  },
});
function CommentCountView({ node }: ReactNodeViewProps) {
  const ui = useDocUi();
  if (ui.commentsResolved) return <NodeViewWrapper as="span" />;
  return (
    <NodeViewWrapper as="span">
      <button
        type="button"
        onClick={ui.openComments}
        aria-label={`${String(node.attrs.count)} comments — open thread`}
        className="mx-[2px] ml-1 inline-flex h-[18px] items-center gap-[3px] rounded-[9px] bg-warns px-[5px] align-[2px] font-sans text-[10.5px] font-semibold text-warn"
      >
        <MessageSquare aria-hidden="true" className="size-[10px]" />
        {String(node.attrs.count)}
      </button>
    </NodeViewWrapper>
  );
}
export const CommentCount = Node.create({
  name: 'commentCount',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { count: { default: 1 } };
  },
  parseHTML() {
    return [{ tag: 'atlas-comment-count' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-comment-count', mergeAttributes(HTMLAttributes)];
  },
  renderText() {
    return '';
  },
  addNodeView() {
    return ReactNodeViewRenderer(CommentCountView, { as: 'span' });
  },
});
/** A collaborator's suggested edit with accept / reject (sample author). */
function TrackedChangeView({ node, editor, getPos }: ReactNodeViewProps) {
  const ui = useDocUi();
  const from = String(node.attrs.from ?? '');
  const to = String(node.attrs.to ?? '');
  const resolve = (text: string, message: string) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: pos, to: pos + node.nodeSize }, text)
      .run();
    ui.flash(message, 'done');
  };
  return (
    <NodeViewWrapper as="span">
      <span className="sr-only">
        Suggested change by {String(node.attrs.author)}: replace “{from}” with “
        {to}”.
      </span>
      <span
        aria-hidden="true"
        className="text-danger line-through decoration-danger"
      >
        {from}
      </span>
      <span
        aria-hidden="true"
        className="border-b-[1.5px] border-actx text-actx"
      >
        {to}
      </span>
      <span className="ml-1 inline-flex items-center gap-0.5 rounded-[9px] border border-bd bg-pop py-px pr-[3px] pl-1.5 align-[2px] font-sans text-[10.5px] text-tx2">
        {String(node.attrs.author)}
        <button
          type="button"
          aria-label={`Accept ${String(node.attrs.author)}’s suggestion`}
          onClick={() =>
            resolve(
              to,
              `Accepted ${String(node.attrs.author)}’s suggestion in this local draft`,
            )
          }
          className="grid size-4 place-items-center rounded-full text-actx hover:bg-acs"
        >
          <Check aria-hidden="true" className="size-[10px]" />
        </button>
        <button
          type="button"
          aria-label={`Reject ${String(node.attrs.author)}’s suggestion`}
          onClick={() =>
            resolve(from, `Rejected ${String(node.attrs.author)}’s suggestion`)
          }
          className="grid size-4 place-items-center rounded-full text-danger hover:bg-dangers"
        >
          <X aria-hidden="true" className="size-[10px]" />
        </button>
      </span>
    </NodeViewWrapper>
  );
}
export const TrackedChange = Node.create({
  name: 'trackedChange',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      from: { default: '' },
      to: { default: '' },
      author: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'atlas-suggestion' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-suggestion', mergeAttributes(HTMLAttributes)];
  },
  renderText({ node }) {
    return String(node.attrs.to);
  },
  addNodeView() {
    return ReactNodeViewRenderer(TrackedChangeView, { as: 'span' });
  },
});
function PresenceView({ node }: ReactNodeViewProps) {
  const name = String(node.attrs.name);
  return (
    <NodeViewWrapper as="span">
      <span className="sr-only">{name} is editing here (sample presence).</span>
      <span
        aria-hidden="true"
        className="relative mx-px inline-block h-[1.15em] w-0.5 animate-atlas-blink bg-presence align-[-3px]"
      >
        <span className="absolute bottom-full left-0 rounded-[3px_3px_3px_0] bg-presence px-1 py-0.5 font-sans text-[10px] leading-none font-semibold whitespace-nowrap text-[#1b1b1b]">
          {name}
        </span>
      </span>
    </NodeViewWrapper>
  );
}
export const Presence = Node.create({
  name: 'presence',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { name: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'atlas-presence' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-presence', mergeAttributes(HTMLAttributes)];
  },
  renderText() {
    return '';
  },
  addNodeView() {
    return ReactNodeViewRenderer(PresenceView, { as: 'span' });
  },
});
/** Inline Atlas suggestion block (handoff `AISuggestionBlock`). */
function SuggestionView({
  editor,
  getPos,
  node,
  deleteNode,
}: ReactNodeViewProps) {
  const ui = useDocUi();
  const accept = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: pos, to: pos + node.nodeSize },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Learned sparsity sits between the two: the mask is trained end-to-end, so the model chooses which long-range pairs to keep ',
            },
            { type: 'citation', attrs: { paper: 'p4' } },
            { type: 'text', text: '.' },
          ],
        },
      )
      .run();
    ui.flash(
      'Suggestion accepted into this local draft — undo with ⌘Z',
      'done',
    );
  };
  return (
    <NodeViewWrapper
      as="div"
      contentEditable={false}
      data-drag-handle=""
      className="mt-2 mb-[22px] overflow-hidden rounded-xl border border-bd bg-card font-sans"
    >
      <div className="flex items-center gap-2 border-b border-bd2 px-3 py-2 text-xs text-tx2">
        <Sparkles aria-hidden="true" className="size-[13px] text-actx" />
        <span className="font-medium text-tx">Atlas suggestion</span>
        <span className="truncate">Tighten for §2 of the manuscript</span>
        <span className="flex-1" />
        <SampleTag>Sample</SampleTag>
      </div>
      <p className="px-3.5 py-3 font-read text-[15px] leading-[1.7]">
        <span className="sr-only">Remove: </span>
        <span className="text-tx3 line-through">
          Learned sparsity is a promising direction that several groups have
          started to explore in different ways.
        </span>{' '}
        <span className="sr-only">Insert: </span>
        <span className="text-actx">
          Learned sparsity sits between the two: the mask is trained end-to-end,
          so the model chooses which long-range pairs to keep{' '}
          <CitationChip paper="p4" className="text-[11.5px]" />.
        </span>
      </p>
      <div className="flex gap-1.5 px-3.5 pb-3">
        <button
          type="button"
          onClick={accept}
          className="inline-flex h-[26px] items-center gap-[5px] rounded-md bg-acb px-2.5 text-xs font-medium text-white hover:bg-acbh"
        >
          <Check aria-hidden="true" className="size-[13px]" />
          Accept
        </button>
        <button
          type="button"
          onClick={() => {
            deleteNode();
            ui.flash('Suggestion discarded');
          }}
          className="h-[26px] rounded-md border border-bd px-2.5 text-xs text-tx2 hover:bg-hov hover:text-tx"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() =>
            ui.flash('Another option needs a model — sample suggestion only')
          }
          className="inline-flex h-[26px] items-center gap-[5px] rounded-md px-2.5 text-xs text-tx2 hover:bg-hov hover:text-tx"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          Try again
        </button>
      </div>
    </NodeViewWrapper>
  );
}
export const AISuggestion = Node.create({
  name: 'aiSuggestion',
  group: 'block',
  atom: true,
  draggable: false,
  parseHTML() {
    return [{ tag: 'atlas-ai-suggestion' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['atlas-ai-suggestion', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SuggestionView);
  },
});
