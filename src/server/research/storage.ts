import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, link, unlink, stat, statfs } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, join } from "node:path";
import { Readable } from "node:stream";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../errors";
import { getEnv } from "../env";
import { research, sourceRow, enqueueFile } from "./library";
export const MAX_PDF_BYTES = 25 * 1024 * 1024,
  PROJECT_FILE_QUOTA = 250 * 1024 * 1024;
export function storageRoot() {
  if (!process.env.FILE_STORAGE_PATH)
    throw new AppError("STORAGE_UNAVAILABLE", 503);
  return resolve(process.env.FILE_STORAGE_PATH);
}
export function objectPath(root: string, w: string, p: string, f: string) {
  if (![w, p, f].every((v) => /^[a-f0-9-]{36}$/i.test(v)))
    throw new AppError("UNAVAILABLE", 404);
  return join(root, w, p, f + ".pdf");
}
export async function uploadPdf(
  request: Request,
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  s: string,
  uploadId: string,
) {
  if (request.headers.get("origin") !== getEnv().APP_ORIGIN)
    throw new AppError("INVALID_INPUT", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf")
    throw new AppError("INVALID_PDF", 415);
  const expected = Number(request.headers.get("content-length"));
  if (!Number.isInteger(expected) || expected < 1)
    throw new AppError("INVALID_INPUT", 411);
  if (expected > MAX_PDF_BYTES) throw new AppError("FILE_TOO_LARGE", 413);
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < expected + 100 * 1024 * 1024)
    throw new AppError("STORAGE_QUOTA", 507);
  let filename = "document.pdf";
  try {
    filename =
      decodeURIComponent(request.headers.get("x-file-name") ?? filename)
        .replace(/[\\/\x00-\x1f\x7f]/g, "_")
        .slice(0, 200) || filename;
  } catch {}
  const intent = await research(db, actor, w, p, true, async (tx) => {
    await sourceRow(tx, w, p, s);
    const existing = await tx.uploadIntent.findUnique({
      where: { id: uploadId },
    });
    if (existing) {
      if (
        existing.workspaceId !== w ||
        existing.projectId !== p ||
        existing.sourceId !== s ||
        existing.createdBy !== actor.id
      )
        throw new AppError("UNAVAILABLE", 404);
      if (existing.state === "completed") return existing;
      throw new AppError("UPLOAD_IN_PROGRESS", 409);
    }
    const [files, reserved, active] = await Promise.all([
      tx.fileObject.aggregate({
        where: { workspaceId: w, projectId: p },
        _sum: { bytes: true },
      }),
      tx.uploadIntent.aggregate({
        where: {
          workspaceId: w,
          projectId: p,
          state: "uploading",
          expiresAt: { gt: new Date() },
        },
        _sum: { expectedBytes: true },
      }),
      tx.uploadIntent.count({
        where: {
          workspaceId: w,
          projectId: p,
          createdBy: actor.id,
          state: "uploading",
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    if (active >= 2) throw new AppError("UPLOAD_IN_PROGRESS", 409);
    if (
      (files._sum.bytes ?? 0) + (reserved._sum.expectedBytes ?? 0) + expected >
      PROJECT_FILE_QUOTA
    )
      throw new AppError("STORAGE_QUOTA", 413);
    return tx.uploadIntent.create({
      data: {
        id: uploadId,
        workspaceId: w,
        projectId: p,
        sourceId: s,
        fileId: randomUUID(),
        createdBy: actor.id,
        expectedBytes: expected,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  });
  if (intent.state === "completed")
    return { versionId: intent.versionId, duplicate: true };
  const final = objectPath(root, w, p, intent.fileId),
    folder = join(root, w, p),
    staging = join(folder, `.${intent.fileId}.part`);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let linked = false,
    committed = false;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_PDF");
  const timer = setTimeout(() => void reader.cancel().catch(() => {}), 120000);
  try {
    handle = await open(staging, "wx", 0o600);
    const hash = createHash("sha256");
    let size = 0,
      first = Buffer.alloc(0),
      tail = Buffer.alloc(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (request.signal.aborted) throw new Error();
      size += value.byteLength;
      if (size > expected || size > MAX_PDF_BYTES)
        throw new AppError("FILE_TOO_LARGE", 413);
      const chunk = Buffer.from(value);
      if (first.length < 8)
        first = Buffer.concat([first, chunk]).subarray(0, 8);
      tail = Buffer.concat([tail, chunk]).subarray(-2048);
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    if (
      size !== expected ||
      !first.toString("ascii").startsWith("%PDF-") ||
      !tail.toString("ascii").includes("%%EOF")
    )
      throw new AppError("INVALID_PDF", 415);
    const sha256 = hash.digest("hex");
    await handle.sync();
    await handle.chmod(0o400);
    await handle.close();
    handle = undefined;
    await link(staging, final);
    linked = true;
    const result = await research(db, actor, w, p, true, async (tx) => {
      const source = await sourceRow(tx, w, p, s),
        prior = await tx.sourceVersion.findMany({
          where: { workspaceId: w, projectId: p, sourceId: s },
          orderBy: { ordinal: "desc" },
        });
      const same = await tx.fileObject.findFirst({
        where: {
          id: { in: prior.flatMap((v) => (v.fileId ? [v.fileId] : [])) },
          sha256,
        },
      });
      if (same) {
        const v = prior.find((v) => v.fileId === same.id)!;
        await tx.uploadIntent.update({
          where: { id: uploadId },
          data: { state: "completed", versionId: v.id },
        });
        return { versionId: v.id, duplicate: true };
      }
      await tx.fileObject.createMany({
        data: [
          {
            id: intent.fileId,
            workspaceId: w,
            projectId: p,
            filename,
            sha256,
            bytes: size,
            createdBy: actor.id,
          },
        ],
      });
      const id = randomUUID(),
        metadata = {
          title: source.title,
          authors: source.authors,
          year: source.year,
          doi: source.doi,
          url: source.url,
          venue: source.venue,
          abstract: source.abstract,
        } as Prisma.InputJsonValue;
      await tx.sourceVersion.createMany({
        data: [
          {
            id,
            workspaceId: w,
            projectId: p,
            sourceId: s,
            ordinal: (prior[0]?.ordinal ?? 0) + 1,
            fileId: intent.fileId,
            metadata,
            extractionStatus: "queued",
          },
        ],
      });
      await enqueueFile(tx, actor, w, p, id);
      await tx.uploadIntent.update({
        where: { id: uploadId },
        data: { state: "completed", versionId: id },
      });
      return { versionId: id, duplicate: false };
    });
    committed = !result.duplicate;
    if (result.duplicate) await unlink(final).catch(() => {});
    return result;
  } catch (error) {
    await research(db, actor, w, p, true, (tx) =>
      tx.uploadIntent.updateMany({
        where: { id: uploadId, state: "uploading", createdBy: actor.id },
        data: { state: "failed" },
      }),
    ).catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError("UPLOAD_FAILED", 503);
  } finally {
    clearTimeout(timer);
    await handle?.close().catch(() => {});
    await reader.cancel().catch(() => {});
    await unlink(staging).catch(() => {});
    if (linked && !committed) await unlink(final).catch(() => {});
  }
}
export async function servePdf(
  request: Request,
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  s: string,
  v: string,
) {
  const file = await research(db, actor, w, p, false, async (tx) => {
    const version = await tx.sourceVersion.findFirst({
      where: { id: v, sourceId: s, workspaceId: w, projectId: p },
    });
    if (!version?.fileId) throw new AppError("UNAVAILABLE", 404);
    const f = await tx.fileObject.findFirst({
      where: { id: version.fileId, workspaceId: w, projectId: p },
    });
    if (!f) throw new AppError("UNAVAILABLE", 404);
    return f;
  });
  const path = objectPath(storageRoot(), w, p, file.id);
  const details = await stat(path).catch(() => null);
  if (!details?.isFile() || details.size !== file.bytes)
    throw new AppError("STORAGE_UNAVAILABLE", 503);
  let start = 0,
    end = file.bytes - 1,
    status = 200;
  const range = request.headers.get("range");
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    ETag: `"${file.sha256}"`,
    "Content-Disposition": `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, "%27")}`,
  });
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2]))
      return new Response(null, {
        status: 416,
        headers: {
          ...Object.fromEntries(headers),
          "Content-Range": `bytes */${file.bytes}`,
        },
      });
    if (!m[1]) start = Math.max(0, file.bytes - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(end, Number(m[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= file.bytes
    )
      return new Response(null, {
        status: 416,
        headers: {
          ...Object.fromEntries(headers),
          "Content-Range": `bytes */${file.bytes}`,
        },
      });
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${file.bytes}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(path, { start, end }),
        ) as ReadableStream),
    { status, headers },
  );
}
