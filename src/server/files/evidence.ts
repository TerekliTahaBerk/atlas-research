import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
export const sha = (text: string) =>
  createHash("sha256").update(text).digest("hex");
// PostgreSQL substring and these offsets both count Unicode code points (not UTF-16 units).
export function splitPages(text: string, pageCount: number) {
  const pages = text.replace(/\r\n?/g, "\n").replaceAll("\0", "").split("\f");
  if (pages.at(-1)?.trim() === "") pages.pop();
  if (pages.length !== pageCount) throw new Error("Page boundary mismatch");
  return pages.map((text, i) => {
    const points = Array.from(text);
    if (points.length > 200000) throw new Error("Page text limit");
    const chunks: { start: number; end: number; text: string }[] = [];
    for (let start = 0; start < points.length;) {
      let end = Math.min(start + 1600, points.length);
      if (end < points.length) {
        for (let j = end; j > start + 1100; j--)
          if (/\s/.test(points[j - 1])) {
            end = j;
            break;
          }
      }
      const quote = points.slice(start, end).join("");
      if (quote.trim()) chunks.push({ start, end, text: quote });
      if (end === points.length) break;
      start = Math.max(start + 1, end - 160);
    }
    return { page: i + 1, text, sha256: sha(text), chunks };
  });
}
export async function indexPages(
  c: PoolClient,
  scope: {
    workspaceId: string;
    projectId: string;
    versionId: string;
    sourceId: string;
    fileSha256: string;
  },
  text: string,
  pageCount: number,
  extractor: string,
) {
  const pages = splitPages(text, pageCount);
  for (const p of pages) {
    const id = randomUUID();
    await c.query(
      'INSERT INTO app.source_pages(id,"workspaceId","projectId","sourceId","versionId",page,text,sha256,"fileSha256",extractor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT("versionId",page,extractor) DO NOTHING',
      [
        id,
        scope.workspaceId,
        scope.projectId,
        scope.sourceId,
        scope.versionId,
        p.page,
        p.text,
        p.sha256,
        scope.fileSha256,
        extractor,
      ],
    );
    const saved = (
      await c.query(
        'SELECT id,sha256 FROM app.source_pages WHERE "versionId"=$1 AND page=$2 AND extractor=$3',
        [scope.versionId, p.page, extractor],
      )
    ).rows[0];
    if (!saved || saved.sha256 !== p.sha256)
      throw new Error("Immutable extraction mismatch");
    for (const part of p.chunks)
      await c.query(
        'INSERT INTO app.source_chunks(id,"workspaceId","projectId","pageId",start,"end",text) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT("pageId",start) DO NOTHING',
        [
          randomUUID(),
          scope.workspaceId,
          scope.projectId,
          saved.id,
          part.start,
          part.end,
          part.text,
        ],
      );
  }
  await c.query(
    'UPDATE app.source_versions SET "indexRevision"=$2 WHERE id=$1',
    [scope.versionId, extractor],
  );
}
