import { z } from 'zod';

/*
 * Phase 04 document schema (version 1). Stored Tiptap JSON is untrusted input:
 * the server validates every payload with `validateDocumentContent` before the
 * database repeats a defensive type/reference check. Rendering never turns
 * stored JSON into executable HTML; exports escape everything they emit.
 */
export const DOCUMENT_SCHEMA_VERSION = 1;
export const documentLimits = {
  /** Serialized JSON bytes; mirrored by a database CHECK. */
  bytes: 400_000,
  depth: 24,
  nodes: 20_000,
  /** Total plain-text characters across the document. */
  text: 200_000,
  /** Characters per text node. */
  nodeText: 20_000,
  references: 500,
} as const;

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

const uuid = z.uuid();
const label = z.string().max(200).nullable().optional();
const nullableInt = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullable().optional();
const sha = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable()
  .optional();
const nullableUuid = uuid.nullable().optional();

/** A citation keeps stable source identity; the label is presentation only. */
export const citationAttrs = z
  .object({
    projectPaperId: uuid,
    sourceVersionId: nullableUuid,
    annotationId: nullableUuid,
    chunkId: nullableUuid,
    page: nullableInt(1, 10000),
    quote: z.string().min(1).max(2000).nullable().optional(),
    startOffset: nullableInt(0, 10_000_000),
    endOffset: nullableInt(0, 10_000_000),
    sourceChecksum: sha,
    label,
  })
  .strict();
export type CitationAttrs = z.infer<typeof citationAttrs>;
const refAttrs = {
  documentRef: z.object({ documentId: uuid, label }).strict(),
  taskRef: z.object({ taskId: uuid, label }).strict(),
  personMention: z.object({ profileId: uuid, label }).strict(),
};
export const referenceNodeTypes = [
  'citation',
  'documentRef',
  'taskRef',
  'personMention',
] as const;
export type ReferenceNodeType = (typeof referenceNodeTypes)[number];

const empty = z.object({}).strict();
const blockAttrs: Record<string, z.ZodType> = {
  doc: empty,
  paragraph: empty,
  blockquote: empty,
  bulletList: empty,
  listItem: empty,
  taskList: empty,
  horizontalRule: empty,
  hardBreak: empty,
  heading: z
    .object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
    .strict(),
  orderedList: z
    .object({
      start: z.number().int().min(0).max(100000).optional(),
      type: z.enum(['1', 'a', 'A', 'i', 'I']).nullable().optional(),
    })
    .strict(),
  taskItem: z.object({ checked: z.boolean().optional() }).strict(),
  codeBlock: z
    .object({
      language: z
        .string()
        .regex(/^[a-z0-9+#.-]{1,24}$/i)
        .nullable()
        .optional(),
    })
    .strict(),
  citation: citationAttrs,
  ...refAttrs,
};

type Kind = 'root' | 'block' | 'inline' | 'listItem' | 'taskItem' | 'text';
const inline = new Set(['text', 'hardBreak', ...referenceNodeTypes]);
const children: Record<string, Kind | null> = {
  doc: 'block',
  paragraph: 'inline',
  heading: 'inline',
  blockquote: 'block',
  bulletList: 'listItem',
  orderedList: 'listItem',
  listItem: 'block',
  taskList: 'taskItem',
  taskItem: 'block',
  codeBlock: 'text',
  horizontalRule: null,
  hardBreak: null,
  text: null,
  citation: null,
  documentRef: null,
  taskRef: null,
  personMention: null,
};
const blocks = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'horizontalRule',
]);

const safeHref = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'Only http, https and mailto links are allowed.');
const markAttrs: Record<string, z.ZodType> = {
  bold: empty,
  italic: empty,
  strike: empty,
  code: empty,
  underline: empty,
  link: z
    .object({
      href: safeHref,
      target: z.literal('_blank').nullable().optional(),
      rel: z
        .string()
        .regex(
          /^(?:noopener|noreferrer|nofollow|ugc)(?: (?:noopener|noreferrer|nofollow|ugc))*$/,
        )
        .nullable()
        .optional(),
      class: z.null().optional(),
      title: z.string().max(200).nullable().optional(),
    })
    .strict(),
};

const forbiddenControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type ContentValidation =
  | { ok: true; content: DocNode; text: string; references: number }
  | { ok: false; reason: string };

/**
 * Validates untrusted editor JSON against the version-1 schema: allowed node
 * and mark types, structural nesting, attribute types, link schemes, depth,
 * node count, text and byte limits. Returns a plain-text projection.
 */
export function validateDocumentContent(input: unknown): ContentValidation {
  let bytes: number;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return { ok: false, reason: 'Content is not serializable.' };
  }
  if (bytes > documentLimits.bytes)
    return { ok: false, reason: 'The document is too large.' };
  let nodes = 0;
  let textLength = 0;
  let references = 0;
  const fail = (reason: string): never => {
    throw new ContentError(reason);
  };
  const visit = (raw: unknown, depth: number, expected: Kind): DocNode => {
    if (depth > documentLimits.depth)
      fail('The document is nested too deeply.');
    if (++nodes > documentLimits.nodes)
      fail('The document has too many nodes.');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      fail('Invalid node.');
    const node = raw as Record<string, unknown>;
    for (const key of Object.keys(node))
      if (!['type', 'attrs', 'content', 'text', 'marks'].includes(key))
        fail(`Unsupported node field “${key}”.`);
    const type = node.type;
    if (typeof type !== 'string' || !(type in children))
      fail('Unsupported node type.');
    const t = type as string;
    const allowed =
      expected === 'root'
        ? t === 'doc'
        : expected === 'block'
          ? blocks.has(t)
          : expected === 'inline'
            ? inline.has(t)
            : expected === 'text'
              ? t === 'text'
              : t === expected;
    if (!allowed) fail(`“${t}” is not allowed here.`);
    const out: DocNode = { type: t };
    if (t === 'text') {
      const text = node.text;
      if (
        typeof text !== 'string' ||
        !text.length ||
        text.length > documentLimits.nodeText
      )
        fail('Invalid text.');
      if (forbiddenControl.test(text as string))
        fail('Text contains control characters.');
      textLength += (text as string).length;
      if (textLength > documentLimits.text)
        fail('The document has too much text.');
      out.text = text as string;
      if (node.attrs !== undefined || node.content !== undefined)
        fail('Invalid text node.');
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 8)
          fail('Invalid marks.');
        if (expected === 'text' && (node.marks as unknown[]).length)
          fail('Code blocks have no marks.');
        out.marks = (node.marks as unknown[]).map((m) => {
          if (!m || typeof m !== 'object' || Array.isArray(m))
            fail('Invalid mark.');
          const mark = m as Record<string, unknown>;
          for (const key of Object.keys(mark))
            if (key !== 'type' && key !== 'attrs') fail('Invalid mark.');
          const schema =
            typeof mark.type === 'string' ? markAttrs[mark.type] : undefined;
          if (!schema) fail('Unsupported mark.');
          const parsed = schema!.safeParse(mark.attrs ?? {});
          if (!parsed.success) fail('Invalid mark attributes.');
          return mark.attrs === undefined
            ? { type: mark.type as string }
            : {
                type: mark.type as string,
                attrs: mark.attrs as Record<string, unknown>,
              };
        });
      }
      return out;
    }
    if (node.text !== undefined || node.marks !== undefined)
      fail('Invalid node.');
    const schema = blockAttrs[t]!;
    if ((referenceNodeTypes as readonly string[]).includes(t)) {
      if (++references > documentLimits.references)
        fail('Too many references.');
      if (node.attrs === undefined) fail('References need attributes.');
    }
    if (node.attrs !== undefined) {
      if (
        !node.attrs ||
        typeof node.attrs !== 'object' ||
        Array.isArray(node.attrs)
      )
        fail('Invalid attributes.');
      const parsed = schema.safeParse(node.attrs);
      if (!parsed.success) fail(`Invalid attributes on “${t}”.`);
      if (t === 'citation') checkCitation(parsed.data as CitationAttrs, fail);
      for (const value of Object.values(node.attrs as object))
        if (typeof value === 'string' && forbiddenControl.test(value))
          fail('Attributes contain control characters.');
      out.attrs = node.attrs as Record<string, unknown>;
    }
    const kind = children[t];
    if (node.content !== undefined) {
      if (!kind || !Array.isArray(node.content))
        fail(`“${t}” cannot have content.`);
      out.content = (node.content as unknown[]).map((child) =>
        visit(child, depth + 1, kind!),
      );
    }
    if (t === 'doc' && !out.content?.length)
      fail('A document needs at least one block.');
    if (
      (t === 'listItem' || t === 'taskItem') &&
      out.content?.[0]?.type !== 'paragraph'
    )
      fail('List items start with a paragraph.');
    if (
      ['bulletList', 'orderedList', 'taskList', 'blockquote'].includes(t) &&
      !out.content?.length
    )
      fail(`“${t}” cannot be empty.`);
    return out;
  };
  try {
    const content = visit(input, 0, 'root');
    if (content.type !== 'doc')
      return { ok: false, reason: 'The root must be a document.' };
    return { ok: true, content, text: plainText(content), references };
  } catch (error) {
    if (error instanceof ContentError)
      return { ok: false, reason: error.message };
    throw error;
  }
}
class ContentError extends Error {}
function checkCitation(attrs: CitationAttrs, fail: (reason: string) => never) {
  const located = attrs.annotationId || attrs.chunkId;
  if (attrs.annotationId && attrs.chunkId)
    fail('A citation has one source location.');
  if (located && !attrs.sourceVersionId)
    fail('A located citation needs its source version.');
  if (
    !located &&
    (attrs.quote ||
      attrs.page ||
      attrs.startOffset != null ||
      attrs.endOffset != null)
  )
    fail('Quotes and pages must come from a verified source location.');
  if ((attrs.startOffset == null) !== (attrs.endOffset == null))
    fail('Invalid offsets.');
  if (
    attrs.startOffset != null &&
    attrs.endOffset != null &&
    attrs.startOffset > attrs.endOffset
  )
    fail('Invalid offsets.');
}

/** Shared Zod schema so client and server reject the same payloads. */
export const documentContent = z.unknown().superRefine((value, context) => {
  const result = validateDocumentContent(value);
  if (!result.ok) context.addIssue({ code: 'custom', message: result.reason });
});

export const emptyDocument: DocNode = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

// ------------------------------------------------------------- projections

function inlineText(node: DocNode, refs?: (node: DocNode) => string): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if ((referenceNodeTypes as readonly string[]).includes(node.type))
    return refs ? refs(node) : '';
  return (node.content ?? []).map((child) => inlineText(child, refs)).join('');
}
/** Top-level block texts, used for search projection and version diffs. */
export function blockTexts(
  content: DocNode,
  refs?: (node: DocNode) => string,
): string[] {
  const out: string[] = [];
  const walk = (node: DocNode, prefix: string) => {
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'codeBlock'
    ) {
      out.push(prefix + inlineText(node, refs));
      return;
    }
    if (node.type === 'horizontalRule') {
      out.push('---');
      return;
    }
    for (const child of node.content ?? [])
      walk(
        child,
        node.type === 'taskItem'
          ? `${node.attrs?.checked ? '[x]' : '[ ]'} `
          : node.type === 'blockquote'
            ? `${prefix}> `
            : prefix,
      );
  };
  walk(content, '');
  return out;
}
/** Plain-text projection; reference atoms contribute no stored labels. */
export function plainText(content: DocNode) {
  return blockTexts(content)
    .filter((line) => line.trim())
    .join('\n')
    .slice(0, documentLimits.text);
}
export function wordCount(content: DocNode) {
  return plainText(content).split(/\s+/).filter(Boolean).length;
}

/** Collects typed reference atoms in document order. */
export function referenceNodes(content: DocNode) {
  const found: DocNode[] = [];
  const walk = (node: DocNode) => {
    if ((referenceNodeTypes as readonly string[]).includes(node.type))
      found.push(node);
    node.content?.forEach(walk);
  };
  walk(content);
  return found;
}

// --------------------------------------------------------------------- diff

export type DiffLine = { op: 'same' | 'added' | 'removed'; text: string };
/** Block-level LCS diff, bounded to keep large documents responsive. */
export function diffBlocks(before: string[], after: string[]): DiffLine[] {
  const a = before.slice(0, 2000);
  const b = after.slice(0, 2000);
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] =
        a[i] === b[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!)
      out.push({ op: 'removed', text: a[i++]! });
    else out.push({ op: 'added', text: b[j++]! });
  }
  while (i < a.length) out.push({ op: 'removed', text: a[i++]! });
  while (j < b.length) out.push({ op: 'added', text: b[j++]! });
  return out;
}

// ------------------------------------------------------------------- export

export const documentExportFormats = ['markdown', 'text', 'html'] as const;
export const documentExportFormat = z.enum(documentExportFormats);
export type DocumentExportFormat = z.infer<typeof documentExportFormat>;
/** Resolves a reference atom to its current authorized display text. */
export type ReferenceLabel = (node: DocNode) => string;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
const escapeMarkdown = (value: string) =>
  value.replace(/([\\`*_[\]<>#|~])/g, '\\$1');

function markdownInline(node: DocNode, refs: ReferenceLabel): string {
  if (node.type === 'hardBreak') return '  \n';
  if ((referenceNodeTypes as readonly string[]).includes(node.type))
    return escapeMarkdown(refs(node));
  if (node.type !== 'text')
    return (node.content ?? []).map((c) => markdownInline(c, refs)).join('');
  let text = escapeMarkdown(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'code')
      text = '`' + (node.text ?? '').replace(/`/g, 'ˋ') + '`';
    else if (mark.type === 'bold') text = `**${text}**`;
    else if (mark.type === 'italic') text = `_${text}_`;
    else if (mark.type === 'strike') text = `~~${text}~~`;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string')
      text = `[${text}](<${String(mark.attrs.href).replace(/[<>]/g, '')}>)`;
  }
  return text;
}
function markdownBlock(
  node: DocNode,
  refs: ReferenceLabel,
  indent: string,
): string[] {
  const inlineOf = (n: DocNode) =>
    (n.content ?? []).map((c) => markdownInline(c, refs)).join('');
  switch (node.type) {
    case 'paragraph':
      return [indent + inlineOf(node), ''];
    case 'heading':
      return [
        `${indent}${'#'.repeat(Number(node.attrs?.level ?? 2))} ${inlineOf(node)}`,
        '',
      ];
    case 'codeBlock': {
      const body = (node.content ?? []).map((c) => c.text ?? '').join('');
      const fence = body.includes('```') ? '~~~~' : '```';
      return [
        `${indent}${fence}`,
        ...body.split('\n').map((l) => indent + l),
        `${indent}${fence}`,
        '',
      ];
    }
    case 'horizontalRule':
      return [`${indent}---`, ''];
    case 'blockquote':
      return (node.content ?? [])
        .flatMap((c) => markdownBlock(c, refs, ''))
        .map((line) => `${indent}> ${line}`.trimEnd());
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      let n = Number(node.attrs?.start ?? 1);
      return [
        ...(node.content ?? []).flatMap((item) => {
          const marker =
            node.type === 'orderedList'
              ? `${n++}. `
              : node.type === 'taskList'
                ? `- [${item.attrs?.checked ? 'x' : ' '}] `
                : '- ';
          const lines = (item.content ?? [])
            .flatMap((c) => markdownBlock(c, refs, ''))
            .filter((l) => l !== '');
          return lines.map((line, i) =>
            i === 0 ? indent + marker + line : `${indent}   ${line}`,
          );
        }),
        '',
      ];
    }
    default:
      return [];
  }
}
function htmlInline(node: DocNode, refs: ReferenceLabel): string {
  if (node.type === 'hardBreak') return '<br>';
  if ((referenceNodeTypes as readonly string[]).includes(node.type))
    return `<span class="atlas-reference">${escapeHtml(refs(node))}</span>`;
  if (node.type !== 'text')
    return (node.content ?? []).map((c) => htmlInline(c, refs)).join('');
  let html = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    const tag = {
      bold: 'strong',
      italic: 'em',
      strike: 's',
      code: 'code',
      underline: 'u',
    }[mark.type as 'bold'];
    if (tag) html = `<${tag}>${html}</${tag}>`;
    else if (
      mark.type === 'link' &&
      safeHref.safeParse(mark.attrs?.href).success
    )
      html = `<a href="${escapeHtml(String(mark.attrs?.href))}" rel="noopener noreferrer nofollow">${html}</a>`;
  }
  return html;
}
function htmlBlock(node: DocNode, refs: ReferenceLabel): string {
  const inner = (n: DocNode) =>
    (n.content ?? []).map((c) => htmlInline(c, refs)).join('');
  const nested = (n: DocNode) =>
    (n.content ?? []).map((c) => htmlBlock(c, refs)).join('');
  switch (node.type) {
    case 'paragraph':
      return `<p>${inner(node)}</p>`;
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)));
      return `<h${level}>${inner(node)}</h${level}>`;
    }
    case 'blockquote':
      return `<blockquote>${nested(node)}</blockquote>`;
    case 'bulletList':
      return `<ul>${nested(node)}</ul>`;
    case 'orderedList':
      return `<ol start="${Number(node.attrs?.start ?? 1) | 0}">${nested(node)}</ol>`;
    case 'taskList':
      return `<ul class="task-list">${nested(node)}</ul>`;
    case 'listItem':
      return `<li>${nested(node)}</li>`;
    case 'taskItem':
      return `<li><input type="checkbox" disabled${node.attrs?.checked ? ' checked' : ''}> ${nested(node)}</li>`;
    case 'codeBlock':
      return `<pre><code>${escapeHtml((node.content ?? []).map((c) => c.text ?? '').join(''))}</code></pre>`;
    case 'horizontalRule':
      return '<hr>';
    default:
      return '';
  }
}
/**
 * Renders validated content. HTML output is built only from escaped text and
 * a fixed tag allowlist (no attributes beyond safe links), so it is sanitized
 * by construction.
 */
export function renderDocument(
  title: string,
  content: DocNode,
  format: DocumentExportFormat,
  refs: ReferenceLabel,
) {
  if (format === 'text')
    return `${title}\n\n${blockTexts(content, refs).join('\n')}\n`;
  if (format === 'markdown')
    return `# ${escapeMarkdown(title)}\n\n${(content.content ?? [])
      .flatMap((b) => markdownBlock(b, refs, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(
    title,
  )}</h1>${(content.content ?? []).map((b) => htmlBlock(b, refs)).join('')}</body></html>\n`;
}
