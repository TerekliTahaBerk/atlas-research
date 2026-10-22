import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const zip = process.env.ATLAS_REFERENCE_ZIP;
if (!zip)
  throw new Error(
    'Set ATLAS_REFERENCE_ZIP to the original Handoff specification.zip',
  );
const root = resolve('.qa-artifacts/reference-runtime');
await mkdir(root, { recursive: true });
execFileSync('unzip', ['-qo', resolve(zip), '-d', root]);
const original = await readFile(resolve(root, 'Atlas.dc.html'), 'utf8');
if (!original.includes('componentDidMount(){'))
  throw new Error('Unsupported reference runtime');
// QA bridge only: original template, styles, fixtures and rendering stay intact.
await writeFile(
  resolve(root, 'qa.html'),
  original.replace(
    'componentDidMount(){',
    'componentDidMount(){window.__atlasReference=this;',
  ),
);
await writeFile(
  resolve(root, 'source.json'),
  JSON.stringify(
    {
      archiveSha256: createHash('sha256')
        .update(await readFile(zip))
        .digest('hex'),
      htmlSha256: createHash('sha256').update(original).digest('hex'),
      bridge:
        'Expose the existing Component instance from componentDidMount; no visual edits.',
    },
    null,
    2,
  ),
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};
createServer(async (req, res) => {
  try {
    const file = resolve(
      root,
      `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`,
    );
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res
      .writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(3200, '127.0.0.1', () =>
  console.log(
    'Original design reference: http://127.0.0.1:3200/qa.html (local only)',
  ),
);
