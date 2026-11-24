import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuth } from "../../src/server/auth/create-auth";
import { requireIdentity } from "../../src/server/auth/identity";
import { resolveWorkspaceEntitlement } from "../../src/server/billing/entitlements";
import {
  reserveResource,
  settleResource,
} from "../../src/server/billing/ledger";
import { createDatabase } from "../../src/server/db/client";
import { asIdentity } from "../../src/server/db/transaction";
import { createProject, updateProject } from "../../src/server/domain/projects";
import { ensurePersonalWorkspace } from "../../src/server/domain/personal-workspace";
import { getEnv } from "../../src/server/env";
import { AppError } from "../../src/server/errors";
import { createFileWorker } from "../../src/server/files/worker";
import { createMailQueue } from "../../src/server/mail/outbox";
import {
  addAnnotation,
  addSource,
  getSource,
  removeIndex,
  requestIndex,
} from "../../src/server/research/library";
import { getWorkspaceResourceUsage } from "../../src/server/research/resource-usage";
import {
  objectPath,
  removePdf,
  servePdf,
  uploadPdf,
} from "../../src/server/research/storage";
import { verifiedUser } from "../helpers/identity";
import { startMailServer } from "../helpers/mail";
import { syntheticPdf } from "../helpers/pdf";

const throwsCode = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;

test("workspace project, PDF byte and opt-in text-index meters remain atomic and tenant scoped", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-resource-test-"));
  const previousFlag = process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
  const previousRoot = process.env.FILE_STORAGE_PATH;
  process.env.FILE_STORAGE_PATH = root;
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "1";
  const smtp = await startMailServer();
  const env = { ...getEnv(), SMTP_PORT: smtp.port };
  const authDb = createDatabase(env.AUTH_DATABASE_URL);
  const db = createDatabase(env.DATABASE_URL);
  const mail = createMailQueue(env);
  const auth = createAuth(authDb, env, mail);
  const worker = createFileWorker({ ...process.env, FILE_STORAGE_PATH: root });

  try {
    const alice = await requireIdentity(
      auth,
      (await verifiedUser(auth, mail, smtp)).headers,
    );
    const outsider = await requireIdentity(
      auth,
      (await verifiedUser(auth, mail, smtp)).headers,
    );
    const workspace = await ensurePersonalWorkspace(db, alice);
    const w = workspace.id;
    // Accrual is tested without running untrusted source code. Runner execution
    // remains unavailable until an isolated provider can be qualified.
    const baseJob = { workspaceId: w, actorId: alice.id };
    const python = { ...baseJob, resource: "pythonMilliseconds" as const };
    await assert.rejects(
      asIdentity(db, alice, (tx) =>
        reserveResource(tx, {
          ...python,
          operationId: randomUUID(),
          quantity: 60_001,
        }),
      ),
      throwsCode("RESOURCE_QUOTA"),
    );
    for (let i = 0; i < 20; i++) {
      const job = { ...python, operationId: randomUUID(), quantity: 60_000 };
      await asIdentity(db, alice, async (tx) => {
        await reserveResource(tx, job);
        await settleResource(tx, {
          ...job,
          quantity: i === 0 ? 30_000 : job.quantity,
          outcome: "settle",
        });
        if (i === 0)
          await settleResource(tx, {
            ...job,
            quantity: 30_000,
            outcome: "settle",
          });
      });
    }
    const last = { ...python, operationId: randomUUID(), quantity: 30_000 };
    await asIdentity(db, alice, (tx) => reserveResource(tx, last));
    await assert.rejects(
      asIdentity(db, alice, (tx) =>
        reserveResource(tx, {
          ...python,
          operationId: randomUUID(),
          quantity: 1,
        }),
      ),
      throwsCode("RESOURCE_QUOTA"),
    );
    await asIdentity(db, alice, (tx) =>
      settleResource(tx, { ...last, quantity: 0, outcome: "release" }),
    );
    const latex = {
      ...baseJob,
      resource: "latexCompiles" as const,
      quantity: 1,
    };
    for (let i = 0; i < 20; i++) {
      const compile = { ...latex, operationId: randomUUID() };
      await asIdentity(db, alice, async (tx) => {
        await reserveResource(tx, compile);
        await settleResource(tx, { ...compile, outcome: "settle" });
        if (i === 0)
          await settleResource(tx, { ...compile, outcome: "settle" });
      });
    }
    await assert.rejects(
      asIdentity(db, alice, (tx) =>
        reserveResource(tx, {
          ...latex,
          operationId: randomUUID(),
        }),
      ),
      throwsCode("RESOURCE_QUOTA"),
    );

    async function usage() {
      return asIdentity(db, alice, async (tx) => {
        const plan = await resolveWorkspaceEntitlement(tx, w);
        return getWorkspaceResourceUsage(
          tx,
          w,
          plan.periodStart,
          plan.periodEnd,
        );
      });
    }
    const input = (name: string) => ({ name, requestId: randomUUID() });
    const storedProject = input("File ownership");
    const fileProject = await createProject(db, alice, w, storedProject);
    const sibling = await createProject(db, alice, w, input("Sibling"));
    const beyond = await Promise.allSettled([
      createProject(db, alice, w, input("Concurrent A")),
      createProject(db, alice, w, input("Concurrent B")),
    ]);
    assert.equal(beyond.filter((x) => x.status === "fulfilled").length, 1);
    assert.ok(
      beyond.some(
        (x) => x.status === "rejected" && throwsCode("PROJECT_QUOTA")(x.reason),
      ),
    );
    assert.equal((await usage()).activeProjects, 3);
    assert.equal(
      (await createProject(db, alice, w, storedProject)).id,
      fileProject.id,
    );
    await assert.rejects(
      asIdentity(db, outsider, (tx) =>
        getWorkspaceResourceUsage(tx, w, new Date(0), new Date(1000)),
      ),
      throwsCode("UNAVAILABLE"),
    );

    const metadata = (title: string) => ({
      title,
      authors: [],
      year: null,
      venue: "",
      doi: null,
      url: null,
      abstract: "",
    });
    const source = (
      await addSource(
        db,
        alice,
        w,
        fileProject.id,
        metadata("Storage and index acceptance"),
      )
    ).source;
    function send(
      bytes: Buffer,
      id = randomUUID(),
      expected = bytes.length,
      p = fileProject.id,
      s = source.id,
    ) {
      return uploadPdf(
        new Request(env.APP_ORIGIN + "/fixture-upload", {
          method: "POST",
          headers: {
            origin: env.APP_ORIGIN,
            "content-type": "application/pdf",
            "content-length": String(expected),
          },
          body: new Uint8Array(bytes),
        }),
        db,
        alice,
        w,
        p,
        s,
        id,
      );
    }
    const bytes = syntheticPdf("Index this stored source explicitly");
    await assert.rejects(
      send(bytes, randomUUID(), 10_000_001),
      throwsCode("FILE_TOO_LARGE"),
    );
    await assert.rejects(
      send(Buffer.from("damaged")),
      throwsCode("INVALID_PDF"),
    );
    assert.equal((await usage()).storageReservedBytes, 0);
    const uploadId = randomUUID();
    const first = await send(bytes, uploadId);
    assert.ok(first.versionId);
    assert.equal((await send(bytes, uploadId)).versionId, first.versionId);
    assert.equal((await send(bytes)).versionId, first.versionId);
    const before = await getSource(db, alice, w, fileProject.id, source.id);
    assert.equal(before.versions[0].extractionStatus, "metadata_only");
    assert.deepEqual(before.jobs, []);
    assert.equal((await usage()).indexedBytes, 0);
    assert.equal((await usage()).storageBytes, bytes.length);
    assert.equal((await usage()).monthlyUploads, 1);

    const versionId = first.versionId;
    await assert.rejects(
      requestIndex(db, outsider, w, fileProject.id, source.id, versionId),
      throwsCode("UNAVAILABLE"),
    );
    const other = (
      await addSource(
        db,
        alice,
        w,
        sibling.id,
        metadata("Workspace ledger sibling"),
      )
    ).source;
    const secondary = await send(
      syntheticPdf("Sibling source text"),
      randomUUID(),
      undefined,
      sibling.id,
      other.id,
    );
    assert.ok(secondary.versionId);
    const additional = [];
    for (let i = 0; i < 3; i++) {
      const uploaded = await send(syntheticPdf(`Queue capacity ${i}`));
      assert.ok(uploaded.versionId);
      additional.push(uploaded.versionId);
    }
    const queueFirst = () =>
      requestIndex(db, alice, w, fileProject.id, source.id, versionId);
    const requests = await Promise.all([queueFirst(), queueFirst()]);
    assert.deepEqual(requests, [{ queued: true }, { queued: true }]);
    assert.equal(
      (await getSource(db, alice, w, fileProject.id, source.id)).jobs.length,
      1,
    );
    await requestIndex(db, alice, w, sibling.id, other.id, secondary.versionId);
    await requestIndex(db, alice, w, fileProject.id, source.id, additional[0]);
    await requestIndex(db, alice, w, fileProject.id, source.id, additional[1]);
    await assert.rejects(
      requestIndex(db, alice, w, fileProject.id, source.id, additional[2]),
      throwsCode("INDEX_QUOTA"),
    );
    assert.equal((await usage()).indexReservedBytes, 4 * 5 * 1024 * 1024);
    for (let i = 0; i < 30 && (await usage()).indexReservedBytes; i++)
      await worker.flush();
    const indexed = await usage();
    assert.equal(indexed.indexReservedBytes, 0);
    assert.ok(indexed.indexedBytes > 0);
    assert.equal(
      (await getSource(db, alice, w, fileProject.id, source.id)).versions.find(
        (v) => v.id === versionId,
      )?.extractionStatus,
      "ready",
    );

    await requestIndex(
      db,
      alice,
      w,
      fileProject.id,
      source.id,
      versionId,
      true,
    );
    for (let i = 0; i < 15 && (await usage()).indexReservedBytes; i++)
      await worker.flush();
    assert.equal((await usage()).indexedBytes, indexed.indexedBytes);
    await removeIndex(db, alice, w, fileProject.id, source.id, versionId);
    assert.ok((await usage()).indexedBytes < indexed.indexedBytes);
    const fileRequest = new Request(env.APP_ORIGIN + "/file", {
      headers: { range: "bytes=0-7" },
    });
    assert.equal(
      (
        await servePdf(
          fileRequest,
          db,
          alice,
          w,
          fileProject.id,
          source.id,
          versionId,
        )
      ).status,
      206,
    );
    const annotation = await addAnnotation(
      db,
      alice,
      w,
      fileProject.id,
      source.id,
      versionId,
      {
        kind: "note",
        page: 1,
        body: "Retain this note on its immutable version",
        quote: "",
        rects: [],
        color: "yellow",
      },
    );
    const file = before.files.find((f) => f.id === before.versions[0].fileId);
    assert.ok(file);
    const beforeDelete = await usage();
    await removePdf(db, alice, w, fileProject.id, source.id, versionId);
    const afterDelete = await usage();
    assert.equal(
      afterDelete.storageBytes,
      beforeDelete.storageBytes - bytes.length,
    );
    assert.equal(afterDelete.monthlyUploads, beforeDelete.monthlyUploads);
    assert.equal(
      (await getSource(db, alice, w, fileProject.id, source.id)).annotations[0]
        .id,
      annotation.id,
    );
    await assert.rejects(
      servePdf(fileRequest, db, alice, w, fileProject.id, source.id, versionId),
      throwsCode("UNAVAILABLE"),
    );

    const tombstoned = objectPath(root, w, fileProject.id, file.id);
    const stableSibling = (await getSource(db, alice, w, sibling.id, other.id))
      .files[0];
    const unreferenced = objectPath(root, w, sibling.id, stableSibling.id);
    const beforeYesterday = new Date(Date.now() - 90_000_000);
    await utimes(tombstoned, beforeYesterday, beforeYesterday);
    await utimes(unreferenced, beforeYesterday, beforeYesterday);
    await worker.cleanup();
    await assert.rejects(access(tombstoned));
    await access(unreferenced);

    for (let i = afterDelete.monthlyUploads; i < 20; i++)
      await send(syntheticPdf(`Resource monthly upload ${i}`));
    assert.equal((await usage()).monthlyUploads, 20);
    await assert.rejects(
      send(syntheticPdf("Monthly capacity reached")),
      throwsCode("UPLOAD_QUOTA"),
    );
    const beforeArchive = await usage();
    await updateProject(db, alice, w, fileProject.id, { archived: true });
    assert.equal((await usage()).activeProjects, 2);
    assert.equal((await usage()).storageBytes, beforeArchive.storageBytes);
    await createProject(db, alice, w, input("Use archived active capacity"));
    await assert.rejects(
      updateProject(db, alice, w, fileProject.id, { archived: false }),
      throwsCode("PROJECT_QUOTA"),
    );
    // Historical committed file metadata occupies the workspace even when it
    // is outside the monthly upload window. Small physical uploads above
    // exercise the byte/backend lifecycle without allocating gigabytes in QA.
    await asIdentity(db, alice, (tx) =>
      tx.fileObject.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          id: randomUUID(),
          workspaceId: w,
          projectId: sibling.id,
          createdBy: alice.id,
          filename: `Historical capacity fixture ${i}.pdf`,
          bytes: 100_000_000,
          sha256: i.toString(16).padStart(64, "0"),
          createdAt: new Date("2020-01-01T00:00:00.000Z"),
        })),
      }),
    );
    const full = await usage();
    assert.ok(full.storageBytes > 1_000_000_000);
    assert.equal(full.monthlyUploads, 20);
    await assert.rejects(
      send(
        syntheticPdf("Workspace storage reached"),
        randomUUID(),
        undefined,
        sibling.id,
        other.id,
      ),
      throwsCode("STORAGE_QUOTA"),
    );
  } finally {
    await Promise.all([
      authDb.$disconnect(),
      db.$disconnect(),
      mail.close(),
      worker.close(),
      smtp.close(),
    ]);
    await rm(root, { recursive: true, force: true });
    if (previousFlag === undefined)
      delete process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
    else process.env.ATLAS_RESOURCE_LIMITS_ENABLED = previousFlag;
    if (previousRoot === undefined) delete process.env.FILE_STORAGE_PATH;
    else process.env.FILE_STORAGE_PATH = previousRoot;
  }
});
