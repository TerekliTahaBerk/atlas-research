import pg from "pg";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  indexBytes,
  indexPages,
  splitPages,
  type IndexedPage,
} from "./evidence.js";
import { MAX_INDEX_JOB_BYTES } from "./index-budget.js";
import { resolveBillingDescriptor } from "../billing/descriptor.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { SCHEMA_REVISION } from "../release.js";

const execute = promisify(execFile);
type FileJob = {
  id: string;
  workspaceId: string;
  projectId: string;
  versionId: string;
  actorId: string;
  sessionId: string;
  attempts: number;
  reservedIndexBytes: number;
  reservationExpiresAt: Date | null;
};

class JobStopped extends Error {}

async function fileHash(path: string, expectedBytes: number) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    if (bytes > expectedBytes) throw new Error("File size mismatch");
    hash.update(chunk);
  }
  if (bytes !== expectedBytes) throw new Error("File size mismatch");
  return hash.digest("hex");
}

export function createFileWorker(env: Record<string, string | undefined>) {
  const root = resolve(env.FILE_STORAGE_PATH ?? "/data/atlas-files"),
    metered = env.ATLAS_RESOURCE_LIMITS_ENABLED === "1",
    runtime = new pg.Pool({
      connectionString: env.DATABASE_URL,
      options: "-c TimeZone=UTC",
      max: 2,
      connectionTimeoutMillis: 5000,
    }),
    queue = new pg.Pool({
      connectionString: env.QUEUE_DATABASE_URL,
      options: "-c TimeZone=UTC",
      max: 2,
      connectionTimeoutMillis: 5000,
    });
  async function scope<T>(job: FileJob, fn: (c: pg.PoolClient) => Promise<T>) {
    const c = await runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.session_id',$2,true)",
        [job.actorId, job.sessionId],
      );
      const lock = await c.query(
        "SELECT app.lock_project($1,$2,true) AS allowed",
        [job.workspaceId, job.projectId],
      );
      const access = await c.query(
        "SELECT app.can_write_research($1,$2) AS allowed",
        [job.workspaceId, job.projectId],
      );
      if (!lock.rows[0]?.allowed || !access.rows[0]?.allowed)
        throw new JobStopped("ACCESS_REVOKED");
      const value = await fn(c);
      await c.query("COMMIT");
      return value;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }

  async function assertClaim(c: pg.PoolClient, job: FileJob) {
    const {
      rows: [active],
    } = await c.query(
      `SELECT id,state,attempts,"leaseUntil">clock_timestamp() AS "liveLease"
      FROM ops.file_jobs WHERE "versionId"=$1
      ORDER BY "createdAt" DESC,id DESC LIMIT 1`,
      [job.versionId],
    );
    if (
      active?.id !== job.id ||
      active.state !== "running" ||
      active.attempts !== job.attempts ||
      !active.liveLease
    )
      throw new JobStopped("LEASE_LOST");
  }

  async function assertIndexCapacity(
    c: pg.PoolClient,
    job: FileJob,
    nextBytes?: number,
  ) {
    if (!metered) return;
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('atlas.usage:'||$1::uuid::text,0))",
      [job.workspaceId],
    );
    const {
      rows: [current],
    } = await c.query(
      `SELECT app.billing_descriptor($1) AS descriptor, now() AS "measuredAt",
        (SELECT "indexedBytes" FROM app.source_versions WHERE id=$2 AND "workspaceId"=$1) AS "versionBytes",
        (SELECT "reservationExpiresAt">now() FROM ops.file_jobs WHERE id=$3) AS "liveReservation"`,
      [job.workspaceId, job.versionId, job.id],
    );
    if (!current?.liveReservation || !current.descriptor)
      throw new JobStopped("INDEX_RESERVATION_EXPIRED");
    const plan = resolveBillingDescriptor(
      current.descriptor,
      current.measuredAt,
    );
    const {
      rows: [counter],
    } = await c.query(
      "SELECT app.workspace_resource_usage($1,$2,$3) AS usage",
      [
        job.workspaceId,
        plan.periodStart.toISOString(),
        plan.periodEnd.toISOString(),
      ],
    );
    const metrics = counter?.usage;
    if (!metrics) throw new JobStopped("ACCESS_REVOKED");
    const additional =
      nextBytes === undefined
        ? job.reservedIndexBytes
        : nextBytes - Number(current.versionBytes);
    const otherReservations = Math.max(
      0,
      metrics.indexReservedBytes - job.reservedIndexBytes,
    );
    if (
      metrics.indexedBytes + otherReservations + additional >
      plan.limits.indexedBytes
    )
      throw new JobStopped("INDEX_QUOTA");
  }

  async function markVersionFailure(job: FileJob) {
    await scope(job, async (c) => {
      await assertClaim(c, job);
      await c.query(
        `UPDATE app.source_versions v SET "extractionStatus"='failed'
           FROM app.file_objects f
          WHERE v.id=$1 AND v."indexRevision" IS NULL AND f.id=v."fileId" AND f."deletedAt" IS NULL`,
        [job.versionId],
      );
    }).catch(() => {});
  }

  async function finish(
    job: FileJob,
    state: "failed" | "succeeded" | "cancelled",
    code: string | null,
  ) {
    await queue.query(
      `UPDATE ops.file_jobs SET state=$2,error=$3,"leaseUntil"=NULL,"nextAttemptAt"=now()+interval '60 seconds'
       WHERE id=$1 AND state='running' AND attempts=$4`,
      [job.id, state, code, job.attempts],
    );
  }

  async function flush() {
    // Complete expired leases even if a worker crashed on its final attempt.
    await queue.query(`UPDATE ops.file_jobs SET state='cancelled',error='INDEX_RESERVATION_EXPIRED',"leaseUntil"=NULL
        WHERE (state IN ('pending','running') OR (state='failed' AND attempts<2))
          AND ("reservationExpiresAt"<now() OR (state='running' AND attempts>=2 AND "leaseUntil"<now()))`);
    const claim = await queue.query<FileJob>(
      `UPDATE ops.file_jobs SET state='running',attempts=attempts+1,"leaseUntil"=now()+interval '60 seconds'
        WHERE id=(SELECT id FROM ops.file_jobs WHERE attempts<2 AND "nextAttemptAt"<=now()
          AND ("reservationExpiresAt" IS NULL OR "reservationExpiresAt">now())
          AND (state='pending' OR (state='running' AND "leaseUntil"<now()) OR state='failed')
          ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    );
    const job = claim.rows[0];
    if (!job) return false;
    try {
      const file = await scope(job, async (c) => {
        await assertClaim(c, job);
        await assertIndexCapacity(c, job);
        const {
          rows: [record],
        } = await c.query(
          `SELECT f.id,f.bytes,f.sha256,v."sourceId" FROM app.file_objects f
            JOIN app.source_versions v ON v."fileId"=f.id AND v."workspaceId"=f."workspaceId" AND v."projectId"=f."projectId"
            JOIN app.sources s ON s.id=v."sourceId" AND s."workspaceId"=v."workspaceId" AND s."projectId"=v."projectId"
            WHERE v.id=$1 AND v."workspaceId"=$2 AND v."projectId"=$3 AND f."deletedAt" IS NULL AND s."archivedAt" IS NULL`,
          [job.versionId, job.workspaceId, job.projectId],
        );
        if (!record) throw new JobStopped("SOURCE_UNAVAILABLE");
        return record;
      });
      const path = join(root, job.workspaceId, job.projectId, file.id + ".pdf");
      let state = "ready",
        pages = 0,
        characters = 0,
        safeError: string | null = null,
        indexedPages: IndexedPage[] = [],
        extractor = "";
      if ((await fileHash(path, file.bytes)) !== file.sha256)
        throw new Error("File checksum mismatch");
      try {
        const info = await execute("pdfinfo", [path], {
          timeout: 5000,
          maxBuffer: 100000,
          killSignal: "SIGKILL",
        });
        pages = Number(/^Pages:\s*(\d+)/m.exec(info.stdout)?.[1] ?? 0);
        if (pages < 1) throw new Error();
        if (pages > 500) {
          state = "failed";
          safeError = "PAGE_LIMIT";
        } else {
          const text = await execute(
            "pdftotext",
            ["-enc", "UTF-8", "-eol", "unix", path, "-"],
            {
              timeout: 15000,
              maxBuffer: 2 * 1024 * 1024,
              killSignal: "SIGKILL",
            },
          );
          const tool = await execute("pdftotext", ["-v"], {
            timeout: 2000,
            maxBuffer: 10000,
          });
          const version = /pdftotext version ([^\s]+)/.exec(
            tool.stderr + " " + tool.stdout,
          )?.[1];
          if (!version) throw new Error("Extractor version missing");
          extractor = "poppler-" + version + ";atlas-text-v1";
          characters = text.stdout.trim().length;
          if (characters) {
            indexedPages = splitPages(text.stdout, pages);
            if (indexBytes(indexedPages) > MAX_INDEX_JOB_BYTES)
              throw new Error("Index size limit");
          } else {
            state = "image_only";
          }
        }
      } catch (error) {
        const message =
          error && typeof error === "object" && "stderr" in error
            ? String(error.stderr)
            : "";
        state = /password|encrypted/i.test(message) ? "protected" : "failed";
        safeError =
          state === "protected"
            ? "PASSWORD_PROTECTED"
            : "PDF_PROCESSING_FAILED";
      }
      await scope(job, async (c) => {
        await assertClaim(c, job);
        const {
          rows: [live],
        } = await c.query(
          `SELECT v."indexRevision" FROM app.source_versions v
            JOIN app.file_objects f ON f.id=v."fileId"
            JOIN app.sources s ON s.id=v."sourceId"
           WHERE v.id=$1 AND f.id=$2 AND f."deletedAt" IS NULL AND s."archivedAt" IS NULL`,
          [job.versionId, file.id],
        );
        if (!live) throw new JobStopped("SOURCE_UNAVAILABLE");
        if (state === "ready") {
          await assertIndexCapacity(c, job, indexBytes(indexedPages));
          await indexPages(
            c,
            {
              workspaceId: job.workspaceId,
              projectId: job.projectId,
              versionId: job.versionId,
              sourceId: file.sourceId,
              fileSha256: file.sha256,
            },
            indexedPages,
            extractor,
          );
        }
        if (!live.indexRevision || state === "ready")
          await c.query(
            'UPDATE app.source_versions SET "extractionStatus"=$2,"pageCount"=$3,"textCharacters"=$4,"extractedAt"=now() WHERE id=$1',
            [job.versionId, state, pages || null, characters],
          );
        await assertClaim(c, job);
      });
      await finish(
        job,
        safeError
          ? state === "protected" || safeError === "PAGE_LIMIT"
            ? "cancelled"
            : "failed"
          : "succeeded",
        safeError,
      );
    } catch (error) {
      const stopped = error instanceof JobStopped;
      if (
        !stopped ||
        ["INDEX_QUOTA", "INDEX_RESERVATION_EXPIRED"].includes(error.message)
      )
        await markVersionFailure(job);
      await finish(
        job,
        stopped ? "cancelled" : "failed",
        stopped ? error.message : "PROCESSING_UNAVAILABLE",
      );
    }
    return true;
  }

  async function cleanup() {
    await queue.query("SELECT ops.sweep_expired_ai_runs()");
    await queue.query("SELECT ops.reap_compute_jobs()");
    const uuid = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
    const directoryName = new RegExp(`^${uuid}$`, "i");
    const stagedName = new RegExp(`^\\.${uuid}\\.part$`, "i");
    const finalName = new RegExp(`^(${uuid})\\.pdf$`, "i");
    for (const w of await readdir(root).catch(() => [])) {
      if (!directoryName.test(w)) continue;
      for (const p of await readdir(join(root, w)).catch(() => [])) {
        if (!directoryName.test(p)) continue;
        const candidates = new Map<string, string>();
        async function purge() {
          if (!candidates.size) return;
          const result = await queue.query<{ fileId: string }>(
            'SELECT app.collectable_pdf_blobs($1,$2,$3::uuid[]) AS "fileId"',
            [w, p, Array.from(candidates.keys())],
          );
          for (const file of result.rows) {
            const path = candidates.get(file.fileId);
            if (path) await unlink(path).catch(() => {});
          }
          candidates.clear();
        }
        for (const name of await readdir(join(root, w, p)).catch(() => [])) {
          const staged = stagedName.test(name);
          const final = finalName.exec(name);
          if (!staged && !final) continue;
          const path = join(root, w, p, name);
          const info = await stat(path).catch(() => null);
          if (!info?.isFile() || Date.now() - info.mtimeMs <= 86400000)
            continue;
          if (final) {
            candidates.set(final[1].toLowerCase(), path);
            if (candidates.size === 128) await purge();
          } else {
            await unlink(path).catch(() => {});
          }
        }
        await purge();
      }
    }
  }

  return {
    flush,
    cleanup,
    async heartbeat() {
      await queue.query(
        'INSERT INTO ops.service_heartbeat(service,revision,"checkedAt") VALUES(\'files\',$1,now()) ON CONFLICT(service) DO UPDATE SET revision=excluded.revision,"checkedAt"=excluded."checkedAt"',
        [SCHEMA_REVISION],
      );
    },
    async close() {
      await Promise.all([queue.end(), runtime.end()]);
    },
  };
}
