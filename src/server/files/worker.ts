import pg from "pg";
import { createHash } from "node:crypto";
import { indexPages } from "./evidence.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { SCHEMA_REVISION } from "../release.ts";
const execute = promisify(execFile);
export function createFileWorker(env: Record<string, string | undefined>) {
  const root = resolve(env.FILE_STORAGE_PATH ?? "/data/atlas-files"),
    runtime = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
    }),
    queue = new pg.Pool({
      connectionString: env.QUEUE_DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
    });
  async function scope<T>(
    job: Record<string, string>,
    fn: (c: pg.PoolClient) => Promise<T>,
  ) {
    const c = await runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.session_id',$2,true)",
        [job.actorId, job.sessionId],
      );
      await c.query("SELECT app.lock_workspace($1,false)", [job.workspaceId]);
      await c.query("SELECT app.lock_project($1,$2,false)", [
        job.workspaceId,
        job.projectId,
      ]);
      const a = await c.query(
        "SELECT app.can_write_research($1,$2) AS allowed",
        [job.workspaceId, job.projectId],
      );
      if (!a.rows[0]?.allowed) throw new Error("cancelled");
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
  async function flush() {
    const claim = await queue.query(
        `UPDATE ops.file_jobs SET state='running',attempts=attempts+1,"leaseUntil"=now()+interval '60 seconds' WHERE id=(SELECT id FROM ops.file_jobs WHERE attempts<2 AND "nextAttemptAt"<=now() AND (state='pending' OR (state='running' AND "leaseUntil"<now()) OR state='failed') ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      ),
      job = claim.rows[0];
    if (!job) return false;
    try {
      const file = await scope(
        job,
        async (c) =>
          (
            await c.query(
              'SELECT f.*,v."sourceId" AS "sourceId" FROM app.file_objects f JOIN app.source_versions v ON v."fileId"=f.id AND v."workspaceId"=f."workspaceId" AND v."projectId"=f."projectId" WHERE v.id=$1 AND v."workspaceId"=$2 AND v."projectId"=$3',
              [job.versionId, job.workspaceId, job.projectId],
            )
          ).rows[0],
      );
      if (!file) throw new Error("cancelled");
      const path = join(root, job.workspaceId, job.projectId, file.id + ".pdf");
      let state = "ready",
        pages = 0,
        characters = 0,
        safeError: string | null = null,
        extractedText = "",
        extractor = "";
      if (
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex") !== file.sha256
      )
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
          extractedText = text.stdout;
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
          state = characters ? "ready" : "image_only";
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
        if (state === "ready")
          await indexPages(
            c,
            {
              workspaceId: job.workspaceId,
              projectId: job.projectId,
              versionId: job.versionId,
              sourceId: file.sourceId,
              fileSha256: file.sha256,
            },
            extractedText,
            pages,
            extractor,
          );
        await c.query(
          'UPDATE app.source_versions SET "extractionStatus"=$2,"pageCount"=$3,"textCharacters"=$4,"extractedAt"=now() WHERE id=$1',
          [job.versionId, state, pages || null, characters],
        );
      });
      await queue.query(
        'UPDATE ops.file_jobs SET state=$2,error=$3,"leaseUntil"=NULL,"nextAttemptAt"=now()+interval \'60 seconds\' WHERE id=$1',
        [job.id, safeError ? "failed" : "succeeded", safeError],
      );
    } catch (error) {
      const cancelled = error instanceof Error && error.message === "cancelled";
      if (!cancelled)
        await scope(job, (c) =>
          c.query(
            "UPDATE app.source_versions SET \"extractionStatus\"='failed' WHERE id=$1",
            [job.versionId],
          ),
        ).catch(() => {});
      await queue.query(
        'UPDATE ops.file_jobs SET state=$2,error=$3,"leaseUntil"=NULL,"nextAttemptAt"=now()+interval \'60 seconds\' WHERE id=$1',
        [
          job.id,
          cancelled ? "cancelled" : "failed",
          cancelled ? "ACCESS_REVOKED" : "PROCESSING_UNAVAILABLE",
        ],
      );
    }
    return true;
  }
  async function cleanup() {
    for (const w of await readdir(root).catch(() => [])) {
      if (!/^[a-f0-9-]{36}$/i.test(w)) continue;
      for (const p of await readdir(join(root, w)).catch(() => [])) {
        if (!/^[a-f0-9-]{36}$/i.test(p)) continue;
        for (const name of await readdir(join(root, w, p)).catch(() => [])) {
          if (!/^\.[a-f0-9-]{36}\.part$/i.test(name)) continue;
          const path = join(root, w, p, name),
            s = await stat(path).catch(() => null);
          if (s && Date.now() - s.mtimeMs > 86400000)
            await unlink(path).catch(() => {});
        }
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
