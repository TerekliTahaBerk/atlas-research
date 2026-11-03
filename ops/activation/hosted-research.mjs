import {
  actor,
  request,
  command,
  fixtures,
  save,
  root,
  env,
} from './hosted-smoke.mjs';
import { makePdf } from '../../tests/fixtures/pdf.ts';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { z } = require('zod');
await actor('owner');
const project = fixtures.ownerProject;
if (!project) throw new Error('Run approved owner bootstrap first');
const report = {};
const searched = await request(
  'owner',
  `/api/v1/projects/${project}/research?query=attention&provider=all`,
);
if (searched.status !== 200)
  throw new Error(`Discovery HTTP ${searched.status}`);
const search = z
  .object({
    data: z.object({
      state: z.string(),
      items: z.array(
        z.object({
          openAlexId: z.string().nullable(),
          semanticScholarId: z.string().nullable(),
        }),
      ),
      providers: z.array(
        z.object({ provider: z.string(), status: z.string() }),
      ),
    }),
  })
  .parse(searched.payload).data;
report.discovery = {
  state: search.state,
  items: search.items.length,
  providers: search.providers,
};
if (!fixtures.discoveredPaper && search.items.length) {
  const candidate = search.items.find((x) => x.openAlexId) || search.items[0];
  const provider = candidate.openAlexId ? 'openalex' : 'semantic-scholar';
  try {
    const saved = z.object({ id: z.uuid() }).parse(
      await command('owner', {
        command: 'paper.save',
        projectId: project,
        provider,
        externalId: candidate.openAlexId || candidate.semanticScholarId,
        idempotencyKey: randomUUID(),
      }),
    );
    fixtures.discoveredPaper = saved.id;
    await save();
    report.provider_library_save = 'PASS';
  } catch {
    report.provider_library_save = 'PROVIDER_RETRY_REQUIRED';
  }
} else if (fixtures.discoveredPaper) report.provider_library_save = 'PASS';
console.log(
  JSON.stringify({
    phase: 'LIVE_DISCOVERY',
    ...report.discovery,
    provider_library_save: report.provider_library_save ?? 'NOT_AVAILABLE',
  }),
);
if (!fixtures.pdfPaper) {
  const created = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'paper.create',
      projectId: project,
      title: 'Atlas G5 synthetic PDF — not a publication',
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.pdfPaper = created.id;
  await save();
}
const pdf = makePdf([
  ['Atlas G5 synthetic evidence.', 'Verified scanner and isolated extraction.'],
  ['This harmless fixture is not scientific research.'],
]);
const digest = createHash('sha256').update(pdf).digest('hex');
if (!fixtures.uploadIntent) {
  const response = await request(
    'owner',
    `/api/v1/projects/${project}/uploads`,
    {
      fileName: 'atlas-g5-synthetic.pdf',
      mediaType: 'application/pdf',
      byteSize: pdf.length,
      sha256: digest,
      projectPaperId: fixtures.pdfPaper,
      idempotencyKey: randomUUID(),
    },
  );
  if (response.status !== 200)
    throw new Error(`Upload intent HTTP ${response.status}`);
  const intent = z
    .object({
      data: z.object({
        id: z.uuid(),
        sourceVersionId: z.uuid(),
        upload: z.object({ url: z.url(), token: z.string() }),
      }),
    })
    .parse(response.payload).data;
  fixtures.uploadIntent = intent.id;
  fixtures.sourceVersion = intent.sourceVersionId;
  fixtures.pdfSha256 = digest;
  await save();
  const denied = await request(
    'owner',
    `/api/v1/sources/${intent.sourceVersionId}/access`,
  );
  if (denied.status === 200) throw new Error('Pending upload was readable');
  report.quarantine_read_denial = denied.status;
  const upload = await fetch(intent.upload.url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
      apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    body: pdf,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!upload.ok) throw new Error(`Signed upload HTTP ${upload.status}`);
  fixtures.uploadBytesSent = true;
  await save();
}
if (!fixtures.uploadFinalized) {
  const finalized = await request(
    'owner',
    `/api/v1/uploads/${fixtures.uploadIntent}/finalize`,
    {},
  );
  if (finalized.status !== 200)
    throw new Error(`Finalize HTTP ${finalized.status}`);
  fixtures.uploadFinalized = true;
  await save();
}
let state = '';
for (let i = 0; i < 90; i++) {
  const status = await request(
    'owner',
    `/api/v1/uploads/${fixtures.uploadIntent}/status`,
  );
  const value = z
    .object({ data: z.object({ state: z.string() }) })
    .parse(status.payload).data;
  state = value.state;
  if (state === 'READY') break;
  if (['REJECTED', 'FAILED'].includes(state))
    throw new Error(
      'Actual scanner did not accept synthetic clean PDF: ' + state,
    );
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (state !== 'READY')
  throw new Error('Actual background scanner readiness deadline exceeded');
const access = await request(
  'owner',
  `/api/v1/sources/${fixtures.sourceVersion}/access`,
);
if (access.status !== 200)
  throw new Error(`Reader grant HTTP ${access.status}`);
const grant = z
  .object({
    data: z.object({ url: z.url(), sha256: z.string(), byteSize: z.number() }),
  })
  .parse(access.payload).data;
const download = await fetch(grant.url, {
  redirect: 'error',
  signal: AbortSignal.timeout(20000),
});
const bytes = Buffer.from(await download.arrayBuffer());
if (
  !download.ok ||
  createHash('sha256').update(bytes).digest('hex') !== digest ||
  grant.sha256 !== digest ||
  bytes.length !== pdf.length
)
  throw new Error('Reader bytes/digest mismatch');
report.upload_actual_scan_reader = 'PASS';
// Exercise the deployed, secret-free Poppler HTTP service against the actual
// hosted accepted object. Automatic paid embedding/outbox activation stays off.
const parsed = execFileSync(
  'docker-compose',
  [
    '-f',
    root + '/workers-compose.yml',
    'exec',
    '-T',
    'extractor',
    'python',
    '-c',
    "import sys,urllib.request; b=sys.stdin.buffer.read(); r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8080/extract',data=b,headers={'Content-Type':'application/pdf'}),timeout=45);sys.stdout.buffer.write(r.read())",
  ],
  { input: bytes, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] },
);
const extracted = z
  .object({
    pages: z.array(z.object({ page: z.number(), text: z.string() })),
    sha256: z.string(),
  })
  .parse(JSON.parse(parsed));
if (
  extracted.sha256 !== digest ||
  !extracted.pages[0]?.text.includes('Atlas G5 synthetic evidence.')
)
  throw new Error('Actual deployed extraction mismatch');
report.deployed_poppler_from_hosted_pdf = 'PASS';
report.automatic_ai_indexing = 'DISABLED';
if (!fixtures.annotation) {
  const annotation = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'annotation.create',
      sourceVersionId: fixtures.sourceVersion,
      kind: 'HIGHLIGHT',
      visibility: 'PROJECT',
      body: 'Synthetic validation annotation',
      anchor: {
        pageNumber: 1,
        quote: 'Atlas G5 synthetic evidence.',
        prefix: null,
        suffix: null,
        startOffset: 0,
        endOffset: 'Atlas G5 synthetic evidence.'.length,
        rects: [{ x: 0.1, y: 0.08, width: 0.5, height: 0.04 }],
      },
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.annotation = annotation.id;
  await save();
}
if (!fixtures.note) {
  const note = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'document.cite-source',
      projectId: project,
      projectPaperId: fixtures.pdfPaper,
      sourceVersionId: fixtures.sourceVersion,
      annotationId: fixtures.annotation,
      target: {
        kind: 'new',
        title: 'Atlas G5 source-aware synthetic note',
        documentKind: 'RESEARCH_NOTE',
      },
      commentary: 'This is synthetic verification, not a scientific claim.',
      sharePrivateAnnotation: false,
      clientRequestId: randomUUID(),
    }),
  );
  fixtures.note = note.id;
  await save();
}
if (!fixtures.task) {
  const task = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'task.create',
      projectId: project,
      title: 'Review the synthetic PDF evidence',
      description: 'Return to the original accepted fixture PDF.',
      priority: 'HIGH',
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.task = task.id;
  await save();
}
report.annotation_source_note_task = 'PASS';
await writeFile(
  root + '/g5-research-results.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
