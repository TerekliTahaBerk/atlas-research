// Deterministic, loopback-only Zotero Web API v3 fixture. Synthetic data
// only — never a real researcher's library. Behaviour is keyed by the API
// key so one server exercises every permission and failure path.
import { createServer } from 'node:http';

export const keys = {
  read: 'READONLYKEY0000000000000', // user + group 77, read-only
  write: 'WRITEKEY0000000000000000', // grants write: refused by Atlas
  revoked: 'REVOKEDKEY00000000000000', // 403 after connection
  limited: 'RATELIMITEDKEY0000000000', // 429 Retry-After 30
  slow: 'SLOWKEY00000000000000000', // never answers
};
const item = (key, version, data) => ({
  key,
  version,
  data: { key, version, ...data },
});
const user = [
  item('AAAA1111', 5, {
    itemType: 'journalArticle',
    title: 'Fixture sparse attention survey',
    creators: [
      { creatorType: 'author', firstName: 'Ada', lastName: 'Okafor' },
      { creatorType: 'editor', firstName: 'Ed', lastName: 'Itor' },
    ],
    publicationTitle: 'Journal of Fixtures',
    volume: '4',
    issue: '2',
    pages: '10-20',
    date: '2022-06-01',
    DOI: '10.5555/zotero.fixture.1',
    tags: [{ tag: 'attention' }],
  }),
  item('BBBB2222', 6, {
    itemType: 'bookSection',
    title: 'A chapter without a DOI',
    creators: [{ creatorType: 'author', name: 'Fixture Consortium' }],
    bookTitle: 'Fixture handbook',
    date: '2019',
    extra: 'DOI: 10.5555/zotero.fixture.2',
  }),
  item('CCCC3333', 7, {
    itemType: 'artwork',
    title: 'An unsupported type',
    date: '2020',
  }),
];
const group = [
  item('GGGG4444', 2, {
    itemType: 'preprint',
    title: 'Group preprint',
    date: '2024',
  }),
];
export const state = { updated: false, deleted: new Set(), requests: [] };

export function startZoteroFixture() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = req.headers['zotero-api-key'];
    state.requests.push({
      method: req.method,
      path: url.pathname,
      query: url.search,
      hasKey: !!key,
      version: req.headers['zotero-api-version'],
    });
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'read-only fixture' });
    if (url.pathname === '/health') return send(200, { ok: true });
    if (url.searchParams.has('key'))
      return send(400, { error: 'keys belong in headers' });
    if (key === keys.slow) return; // timeout path
    if (key === keys.limited)
      return send(429, { error: 'slow down' }, { 'retry-after': '30' });
    if (url.pathname === '/keys/current') {
      if (key === keys.write)
        return send(200, {
          key,
          userID: 9001,
          username: 'fixture',
          access: { user: { library: true, write: true } },
        });
      if (key === keys.read || key === keys.revoked)
        return send(200, {
          key,
          userID: 9001,
          username: 'fixture',
          access: {
            user: { library: true, notes: true, write: false },
            groups: { 77: { library: true, write: false } },
          },
        });
      return send(403, { error: 'Invalid key' });
    }
    if (key !== keys.read && key !== keys.revoked)
      return send(403, { error: 'Invalid key' });
    if (url.pathname === '/users/9001/groups')
      return send(200, [
        { id: 77, data: { id: 77, name: 'Fixture Lab' } },
        { id: 88, data: { id: 88, name: 'Not granted' } },
      ]);
    // Revoked between connection and use: library reads are now denied.
    if (key === keys.revoked) return send(403, { error: 'Forbidden' });
    const lib = url.pathname.match(/^\/(users\/9001|groups\/77)(\/.*)$/);
    if (!lib) return send(404, { error: 'not found' });
    const source = (lib[1] === 'users/9001' ? user : group)
      .filter((i) => !state.deleted.has(i.key))
      .map((i) =>
        state.updated && i.key === 'AAAA1111'
          ? item(i.key, 9, {
              ...i.data,
              title: 'Fixture sparse attention survey (revised)',
            })
          : i,
      );
    const libraryVersion = Math.max(...source.map((i) => i.version), 0);
    const page = (all) => {
      const start = Number(url.searchParams.get('start') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 25), 100);
      return send(200, all.slice(start, start + limit), {
        'total-results': String(all.length),
        'last-modified-version': String(libraryVersion),
      });
    };
    if (lib[2] === '/collections')
      return page(
        lib[1] === 'users/9001'
          ? [
              {
                key: 'COLL0001',
                data: { name: 'Thesis', parentCollection: false },
                meta: { numItems: 2 },
              },
            ]
          : [],
      );
    const since = Number(url.searchParams.get('since') ?? -1);
    if (lib[2] === '/items/top' || lib[2] === '/collections/COLL0001/items/top')
      return page(
        source
          .filter((i) => i.version > since)
          .filter((i) => lib[2] === '/items/top' || i.key !== 'CCCC3333'),
      );
    if (lib[2] === '/items') {
      const wanted = (url.searchParams.get('itemKey') ?? '')
        .split(',')
        .filter(Boolean);
      return page(source.filter((i) => wanted.includes(i.key)));
    }
    return send(404, { error: 'not found' });
  });
  return new Promise((resolve) =>
    server.listen(
      Number(process.env.ZOTERO_FIXTURE_PORT ?? 0),
      '127.0.0.1',
      () => resolve(server),
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  startZoteroFixture().then((server) => {
    const address = server.address();
    process.stdout.write(
      `zotero fixture on ${typeof address === 'object' ? address.port : address}\n`,
    );
  });
}
