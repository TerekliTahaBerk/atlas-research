import {
  actor,
  request,
  command,
  fixtures,
  save,
  root,
} from './hosted-smoke.mjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { z } = require('zod');
await actor('owner');
const project = fixtures.ownerProject;
const suffix = fixtures.runId.split('-').at(-1);
const content = `@article{atlasg5,author={Example, Alice},title={Atlas G5 synthetic bibliography},journal={Synthetic Fixture Journal},year={2026},doi={10.5555/atlas.g5.${suffix}}}\n@inproceedings{atlasg5b,author={Example, Bob},title={Atlas G5 synthetic conference reference},booktitle={Synthetic Fixture Conference},year={2025}}\n@misc{invalid,title={Unclosed\n`;
const previewShape = z.object({
  data: z.object({
    items: z.array(
      z.object({
        status: z.string(),
        record: z.record(z.string(), z.unknown()).nullable(),
        link: z.unknown(),
        provenance: z.object({ atlasId: z.uuid().nullable() }),
        match: z
          .object({ projectPaperId: z.uuid(), by: z.string() })
          .nullable(),
      }),
    ),
    issues: z.array(z.object({ severity: z.string() })),
  }),
});
const preview = await request(
  'owner',
  `/api/v1/projects/${project}/imports/preview`,
  { format: 'bibtex', content },
);
if (preview.status !== 200) throw new Error('Hosted BibTeX preview failed');
const parsed = previewShape.parse(preview.payload).data;
const valid = parsed.items.filter((x) => x.record && x.status !== 'INVALID');
if (
  valid.length !== 2 ||
  (!parsed.issues.some((x) => x.severity === 'error') &&
    !parsed.items.some((x) => x.status === 'INVALID'))
)
  throw new Error('Malformed BibTeX was not separated');
if (!fixtures.importedReferences) {
  const imported = z
    .object({
      results: z.array(z.object({ id: z.uuid(), outcome: z.string() })),
    })
    .parse(
      await command('owner', {
        command: 'reference.import',
        projectId: project,
        items: valid.map((x) => ({
          record: x.record,
          link: x.link,
          atlasId: x.provenance.atlasId,
          update: false,
        })),
        idempotencyKey: randomUUID(),
      }),
    );
  fixtures.importedReferences = imported.results.map((x) => x.id);
  await save();
}
const before = await request('owner', `/api/v1/projects/${project}/papers`);
const beforeItems = z
  .object({ data: z.object({ items: z.array(z.object({ id: z.uuid() })) }) })
  .parse(before.payload).data.items;
const exports = {};
for (const format of ['bibtex', 'ris', 'csl-json']) {
  const exported = await request(
    'owner',
    `/api/v1/projects/${project}/export?format=${format}`,
    undefined,
    true,
  );
  if (
    exported.status !== 200 ||
    !exported.payload.includes('Atlas G5 synthetic bibliography')
  )
    throw new Error('Hosted export failed: ' + format);
  const again = await request(
    'owner',
    `/api/v1/projects/${project}/imports/preview`,
    { format, content: exported.payload },
  );
  if (again.status !== 200)
    throw new Error('Roundtrip preview failed: ' + format);
  const records = previewShape
    .parse(again.payload)
    .data.items.filter((x) => x.record && x.status !== 'INVALID');
  if (records.some((x) => x.status !== 'EXISTING'))
    throw new Error('Roundtrip proposed duplicates: ' + format);
  await command('owner', {
    command: 'reference.import',
    projectId: project,
    items: records.map((x) => ({
      record: x.record,
      link: x.link,
      atlasId: x.provenance.atlasId,
      update: false,
    })),
    idempotencyKey: randomUUID(),
  });
  exports[format] = 'PASS';
}
const after = await request('owner', `/api/v1/projects/${project}/papers`);
const afterItems = z
  .object({ data: z.object({ items: z.array(z.object({ id: z.uuid() })) }) })
  .parse(after.payload).data.items;
if (
  beforeItems
    .map((x) => x.id)
    .sort()
    .join() !==
  afterItems
    .map((x) => x.id)
    .sort()
    .join()
)
  throw new Error('Reimport changed library identity/count');
if (!fixtures.bibliographyNote) {
  const note = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'document.create',
      projectId: project,
      title: 'Atlas G5 imported-reference citation',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Synthetic reference: ' },
              {
                type: 'citation',
                attrs: { projectPaperId: fixtures.importedReferences[0] },
              },
            ],
          },
        ],
      },
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.bibliographyNote = note.id;
  await save();
}
const bibliography = await request(
  'owner',
  `/api/v1/projects/${project}/export?format=bibtex&documentId=${fixtures.bibliographyNote}`,
  undefined,
  true,
);
if (
  bibliography.status !== 200 ||
  !bibliography.payload.includes('Atlas G5 synthetic bibliography') ||
  bibliography.payload.includes('Atlas G5 synthetic conference reference')
)
  throw new Error('Document-scoped bibliography export mismatch');
const report = {
  hosted_bibtex_malformed_rejection: 'PASS',
  hosted_import_export_reimport: exports,
  stable_library_identities: afterItems.length,
  document_scoped_bibliography: 'PASS',
};
await writeFile(
  root + '/g5-interop-results.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
