import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  importPreview,
  importPreviewRequest,
  normalizeDoi,
  parseInterchange,
  referenceImportCommand,
  referenceImportResult,
  similarityKey,
  type ImportLink,
  type ImportPreview,
  type ParseIssue,
  type ParsedRecord,
  type PreviewItem,
  type PreviewStatus,
  type ReferenceRecord,
  type ReferenceSource,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { requestHash, requireProject } from './library';

/*
 * A03 reference import. Preview is read-only; nothing is written until the
 * user confirms selected records through `reference.import`, which the SQL
 * boundary re-checks (project write, bounds, DOI syntax, idempotency) and
 * stores as project-private references only.
 */

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const recordHash = (record: ReferenceRecord) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(record)))
    .digest('hex');
const sourceOf: Record<'bibtex' | 'ris' | 'csl-json', ReferenceSource> = {
  bibtex: 'BIBTEX',
  ris: 'RIS',
  'csl-json': 'CSL_JSON',
};

const projectMatch = z.object({
  id: z.uuid(),
  title: z.string(),
  archived: z.boolean(),
  doi: z.string().nullable(),
  folded: z.string(),
  year: z.number().int().nullable(),
});
/**
 * Classifies parsed records against THIS project only. Matching keys, in
 * order: an existing import mapping, an Atlas export marker for a paper of
 * this project, the normalized DOI. Title/year/author resemblance is only a
 * review signal (`POSSIBLE_DUPLICATE`) and never an automatic merge.
 */
export async function classify(
  tx: Prisma.TransactionClient,
  projectId: string,
  parsed: readonly ParsedRecord[],
): Promise<PreviewItem[]> {
  const seenKeys = new Map<string, number>();
  const base = parsed.map((p, index) => {
    let link: ImportLink | null = null;
    if (p.record && p.provenance.library) {
      // A missing or repeated key falls back to the record's position, which
      // is stable for an identical file.
      const raw = p.provenance.key ?? `#${p.provenance.index}`;
      const count = seenKeys.get(raw) ?? 0;
      seenKeys.set(raw, count + 1);
      link = {
        source: p.provenance.source,
        library: p.provenance.library,
        key: count ? `${raw}#${p.provenance.index}` : raw,
        version: p.provenance.version,
      };
      if (count && p.provenance.source !== 'ZOTERO')
        p.issues.push(`Duplicate citation key “${raw}” in this file.`);
    }
    return { p, link, index };
  });
  const links = base.filter((b) => b.link).map((b) => b.link!);
  const mapped = links.length
    ? z
        .array(
          z.object({
            key: z.string(),
            library: z.string(),
            source: z.string(),
            version: z.number().int().nullable(),
            id: z.uuid(),
          }),
        )
        .parse(
          await tx.$queryRaw`SELECT l.item_key AS key, l.library, l.source, l.item_version AS version, l.project_paper_id AS id
            FROM reference_import_links l JOIN jsonb_to_recordset(${JSON.stringify(links)}::jsonb) AS w(source text, library text, key text)
              ON l.source=w.source AND l.library=w.library AND l.item_key=w.key
            WHERE l.project_id=${projectId}::uuid`,
        )
    : [];
  const records = base.flatMap((b) => (b.p.record ? [b.p.record] : []));
  const dois = [
    ...new Set(records.map((r) => r.doi).filter((d): d is string => !!d)),
  ];
  const atlasIds = [
    ...new Set(
      base.map((b) => b.p.provenance.atlasId).filter((v): v is string => !!v),
    ),
  ];
  const folded = [...new Set(records.map((r) => similarityKey(r).title))];
  const ids = [...new Set(mapped.map((m) => m.id))];
  // Candidates from this project only (RLS + explicit project predicate).
  const papers = z.array(projectMatch).parse(
    await tx.$queryRaw`SELECT pp.id, coalesce(pp.private_title,pp.metadata->>'title','') AS title,
       pp.archived_at IS NOT NULL AS archived,
       coalesce(rp.normalized_doi,pp.reference_metadata->>'doi') AS doi,
       btrim(regexp_replace(lower(coalesce(pp.private_title,pp.metadata->>'title','')),'[^[:alnum:]]+',' ','g')) AS folded,
       coalesce((pp.metadata->>'year')::int,(pp.reference_metadata#>>'{issued,year}')::int) AS year
     FROM project_papers pp LEFT JOIN research_papers rp ON rp.id=pp.paper_id
     WHERE pp.project_id=${projectId}::uuid AND (
       pp.id=ANY(${ids}::uuid[]) OR pp.id=ANY(${atlasIds}::uuid[])
       OR rp.normalized_doi=ANY(${dois}::text[]) OR pp.reference_metadata->>'doi'=ANY(${dois}::text[])
       OR btrim(regexp_replace(lower(coalesce(pp.private_title,pp.metadata->>'title','')),'[^[:alnum:]]+',' ','g'))=ANY(${folded}::text[]))
     LIMIT 5000`,
  );
  const byId = new Map(papers.map((p) => [p.id, p]));
  return base.map(({ p, link, index }) => {
    const r = p.record;
    const item = (
      status: PreviewStatus,
      match: PreviewItem['match'] = null,
    ): PreviewItem => ({
      index,
      status,
      record: r,
      provenance: p.provenance,
      link,
      issues: p.issues,
      unsupported: p.unsupported,
      match,
    });
    if (!r) return item('INVALID');
    const existing = (
      paper: z.infer<typeof projectMatch> | undefined,
      by: 'import' | 'atlas-id' | 'doi',
    ) =>
      paper
        ? item(paper.archived ? 'ARCHIVED' : 'EXISTING', {
            projectPaperId: paper.id,
            title: paper.title,
            by,
          })
        : null;
    const map = link
      ? mapped.find(
          (m) =>
            m.source === link.source &&
            m.library === link.library &&
            m.key === link.key,
        )
      : undefined;
    if (map) {
      const paper = byId.get(map.id);
      if (
        paper &&
        !paper.archived &&
        link?.version !== null &&
        link?.version !== undefined &&
        link.version > (map.version ?? -1)
      )
        return item('UPDATE_AVAILABLE', {
          projectPaperId: paper.id,
          title: paper.title,
          by: 'import',
        });
      const found = existing(paper, 'import');
      if (found) return found;
    }
    const marked = p.provenance.atlasId
      ? existing(byId.get(p.provenance.atlasId), 'atlas-id')
      : null;
    if (marked) return marked;
    const doi = normalizeDoi(r.doi);
    if (doi) {
      const found = existing(
        papers.find((x) => x.doi === doi),
        'doi',
      );
      if (found) return found;
    }
    const key = similarityKey(r);
    const similar = papers.find(
      (x) =>
        x.folded === key.title &&
        (x.year === null || key.year === null || x.year === key.year) &&
        // Two different DOIs prove two different works.
        !(doi && x.doi && x.doi !== doi),
    );
    if (similar)
      return item('POSSIBLE_DUPLICATE', {
        projectPaperId: similar.id,
        title: similar.title,
        by: 'title',
      });
    return item('NEW');
  });
}

export function summarize(
  source: ReferenceSource,
  library: string | null,
  items: PreviewItem[],
  issues: ParseIssue[],
): ImportPreview {
  const counts = Object.fromEntries(
    (
      [
        'NEW',
        'EXISTING',
        'ARCHIVED',
        'POSSIBLE_DUPLICATE',
        'UPDATE_AVAILABLE',
        'INVALID',
      ] as const
    ).map((s) => [s, items.filter((i) => i.status === s).length]),
  ) as ImportPreview['counts'];
  return importPreview.parse({ source, library, items, issues, counts });
}

/** POST projects/:id/imports/preview — parse and classify, write nothing. */
export async function previewFileImport(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
) {
  z.uuid().parse(projectId);
  const input = importPreviewRequest.parse(raw);
  // The exact file identity: re-importing the same bytes maps to the same
  // records. Never a secret and never used for authorization.
  const library = `sha256:${createHash('sha256').update(input.content).digest('hex')}`;
  const parsed = parseInterchange(input.format, input.content, library);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.write');
    const items = await classify(tx, projectId, parsed.records);
    return summarize(sourceOf[input.format], library, items, parsed.issues);
  });
}

/** `reference.import`: one confirmed, idempotent batch. */
export async function executeReferenceImport(
  actor: VerifiedActor,
  raw: unknown,
  requestId: string,
) {
  const command = referenceImportCommand.parse(raw);
  const hash = requestHash(command);
  const items = command.items.map((item) => ({
    record: { ...item.record, doi: normalizeDoi(item.record.doi) },
    atlasId: item.atlasId,
    update: item.update,
    link: item.link
      ? { ...item.link, recordHash: recordHash(item.record) }
      : null,
  }));
  return withActor(actor, async (tx) => {
    const [row] = z.array(z.object({ result: z.unknown() })).parse(
      await tx.$queryRaw`SELECT atlas_private.mutate('reference.import',${JSON.stringify(
        {
          projectId: command.projectId,
          idempotencyKey: command.idempotencyKey,
          requestHash: hash,
          items,
        },
      )}::jsonb,${requestId}::uuid) AS result`,
    );
    return referenceImportResult.parse(row?.result);
  });
}
