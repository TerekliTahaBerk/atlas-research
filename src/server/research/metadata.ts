import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Database } from "../db/client";
import { AppError } from "../errors";
import type { MetadataInput, DiscoveryItem } from "../../lib/research-types";

export function normalizeDoi(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  let value = raw
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  try {
    value = decodeURIComponent(value);
  } catch {}
  value = value.toLowerCase();
  if (!/^10\.\d{4,9}\/[^\s]{1,220}$/.test(value))
    throw new AppError("INVALID_DOI");
  return value;
}
export function normalizeUrl(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      throw new Error();
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    const value = u.toString().replace(/\/$/, "");
    if (value.length > 2000) throw new Error();
    return value;
  } catch {
    throw new AppError("INVALID_URL");
  }
}
export const metadataInput = z.object({
  title: z.string().trim().min(1).max(500),
  authors: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  year: z.number().int().min(1000).max(2200).nullable().default(null),
  venue: z.string().trim().max(500).default(""),
  doi: z.string().max(250).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  abstract: z.string().max(12000).default(""),
  provider: z.enum(["manual", "crossref", "pdf"]).default("manual"),
});
export function cleanMetadata(raw: unknown) {
  const parsed = metadataInput.safeParse(raw);
  if (!parsed.success) throw new AppError("INVALID_INPUT");
  const input = parsed.data;
  let doi = normalizeDoi(input.doi);
  if (!doi && input.url && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(input.url))
    doi = normalizeDoi(input.url);
  return {
    ...input,
    doi,
    url: normalizeUrl(input.url) || (doi ? `https://doi.org/${doi}` : null),
  };
}
type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  abstract?: string;
};
function text(raw: string) {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function mapWork(w: CrossrefWork): DiscoveryItem | null {
  if (!w.DOI || !w.title?.[0]) return null;
  return {
    providerId: w.DOI.toLowerCase(),
    doi: w.DOI.toLowerCase(),
    title: text(w.title[0]).slice(0, 500),
    authors: (w.author ?? [])
      .slice(0, 100)
      .map((a) => [a.given, a.family].filter(Boolean).join(" ") || a.name || "")
      .filter(Boolean),
    year:
      w.published?.["date-parts"]?.[0]?.[0] ??
      w["published-print"]?.["date-parts"]?.[0]?.[0] ??
      null,
    venue: w["container-title"]?.[0] ?? "",
    url: `https://doi.org/${w.DOI}`,
    abstract: text(w.abstract ?? "").slice(0, 12000),
    provider: "crossref",
  };
}
export async function discover(
  db: Database,
  query: string,
  page = 0,
  doi?: string | null,
): Promise<{ items: DiscoveryItem[]; hasMore: boolean; provider: string }> {
  const lease = randomUUID();
  const claimed = await db.$queryRaw<
    { provider: string }[]
  >`UPDATE ops.provider_budget SET "nextAt"=now()+interval '11 seconds',lease=${lease}::uuid WHERE provider='crossref' AND "nextAt"<=now() RETURNING provider`;
  if (!claimed.length) throw new AppError("PROVIDER_BUSY", 429);
  const endpoint = doi
    ? `https://api.crossref.org/works/${encodeURIComponent(normalizeDoi(doi)!)}`
    : `https://api.crossref.org/works?${new URLSearchParams({ "query.bibliographic": query, rows: "10", offset: String(page * 10) })}`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "AtlasResearch/0.2 (https://github.com/TerekliTahaBerk/atlas-research)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const works: CrossrefWork[] = doi ? [data.message] : data.message.items;
    return {
      items: works.map(mapWork).filter((v): v is DiscoveryItem => v !== null),
      hasMore: !doi && works.length === 10,
      provider: "Crossref",
    };
  } catch {
    throw new AppError("PROVIDER_UNAVAILABLE", 503);
  } finally {
    await db.$executeRaw`UPDATE ops.provider_budget SET "nextAt"=greatest(now(),"nextAt"-interval '10 seconds'),lease=NULL WHERE provider='crossref' AND lease=${lease}::uuid`.catch(
      () => {},
    );
  }
}
export function bibtex(sources: (MetadataInput & { id: string })[]) {
  const escape = (v: string) =>
    v
      .replace(/\\/g, "\\textbackslash{} ")
      .replace(/[{}%&_#]/g, (m) => `\\${m}`)
      .replace(/[\r\n]/g, " ");
  return (
    sources
      .map(
        (s) =>
          `@article{atlas_${s.id.replaceAll("-", "")},\n${[
            ["title", s.title],
            ["author", s.authors.map((a) => `{${escape(a)}}`).join(" and ")],
            ["year", s.year?.toString()],
            ["journal", s.venue],
            ["doi", s.doi],
            ["url", s.url],
            ["note", `Atlas source ${s.id}`],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => `  ${k} = {${k === "author" ? v : escape(v!)}},`)
            .join("\n")}\n}`,
      )
      .join("\n\n") + "\n"
  );
}
export function ris(sources: (MetadataInput & { id: string })[]) {
  const line = (k: string, v: string | null | undefined) =>
    v ? `${k}  - ${v.replace(/[\r\n]+/g, " ")}\r\n` : "";
  return sources
    .map(
      (s) =>
        "TY  - JOUR\r\n" +
        line("ID", s.id) +
        line("TI", s.title) +
        s.authors.map((a) => line("AU", a)).join("") +
        line("PY", s.year?.toString()) +
        line("JO", s.venue) +
        line("DO", s.doi) +
        line("UR", s.url) +
        line("AB", s.abstract) +
        "ER  - \r\n",
    )
    .join("\r\n");
}
