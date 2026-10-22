// Loopback-only scholarly API fixture for the isolated browser journeys. It
// serves the synthetic, documented-shape fixtures in tests/fixtures/providers
// so the real adapters run over HTTP without depending on provider uptime.
// A query containing "outage" makes Semantic Scholar return 503 (partial
// failure); "nothing" returns empty pages from both providers.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const load = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/providers/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
const openalexSearch = load('openalex-search');
const openalexWork = load('openalex-work');
const s2Search = load('semantic-scholar-search');
const s2Paper = load('semantic-scholar-paper');
const s2ById = new Map(
  [...s2Search.data, s2Paper]
    .filter((p) => typeof p.paperId === 'string' && p.paperId.length === 40)
    .map((p) => [p.paperId, p]),
);

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (url.pathname === '/works') {
    const q = url.searchParams.get('search') ?? '';
    if (q.includes('nothing'))
      return send(res, 200, { meta: { count: 0 }, results: [] });
    return send(res, 200, openalexSearch);
  }
  if (url.pathname.startsWith('/works/')) {
    const id = url.pathname.slice('/works/'.length);
    return id === 'W9900000001'
      ? send(res, 200, openalexWork)
      : send(res, 404, { error: 'not found' });
  }
  if (url.pathname === '/graph/v1/paper/search') {
    const q = url.searchParams.get('query') ?? '';
    if (q.includes('outage')) return send(res, 503, { message: 'unavailable' });
    if (q.includes('nothing'))
      return send(res, 200, { total: 0, offset: 0, data: [] });
    return send(res, 200, s2Search);
  }
  if (url.pathname.startsWith('/graph/v1/paper/')) {
    const paper = s2ById.get(url.pathname.slice('/graph/v1/paper/'.length));
    return paper
      ? send(res, 200, paper)
      : send(res, 404, { error: 'not found' });
  }
  return send(res, 404, { error: 'not found' });
});
server.listen(3199, '127.0.0.1');
