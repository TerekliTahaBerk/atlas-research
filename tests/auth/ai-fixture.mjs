// Strictly loopback-only wire fixture. No provider key, network egress or real inference.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
const vector = (text) => {
  const result = Array(768).fill(0);
  for (const term of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? ['empty']) {
    const h = createHash('sha256').update(term).digest();
    result[h.readUInt16BE(0) % 768] += 1;
  }
  return result;
};
const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"fixture":true}');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(404);
    res.end();
    return;
  }
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > 200000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (req.url === '/v1/embeddings') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        data: body.input.map((t, index) => ({
          object: 'embedding',
          index,
          embedding: vector(t),
        })),
        model: body.model,
        usage: {
          prompt_tokens: body.input.join('').length,
          total_tokens: body.input.join('').length,
        },
      }),
    );
    return;
  }
  if (req.url !== '/v1/responses') {
    res.writeHead(404);
    res.end();
    return;
  }
  const messages = body.input ?? [];
  const prompt = messages.at(-2)?.content ?? '';
  if (prompt.includes('fixture-outage')) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"synthetic outage"}}');
    return;
  }
  const content = messages.at(-1)?.content ?? '';
  let evidence = [];
  try {
    evidence = JSON.parse(
      content.split('UNTRUSTED_EVIDENCE_JSON\n')[1] ?? '[]',
    );
  } catch {
    /*invalid fixture context*/
  }
  const selected = evidence.slice(0, 4);
  const text = selected.length
    ? selected
        .map(
          (s) =>
            `Synthetic fixture interpretation: ${s.text.slice(0, 100)} [[${s.id}]]`,
        )
        .join('\n')
    : 'No relevant authorized evidence is available.';
  const answer = {
    text,
    citations: selected.map((s) => ({
      evidenceId: s.id,
      quote: s.text.slice(0, 100),
      startOffset: s.startOffset,
      endOffset: s.startOffset + Math.min(100, s.text.length),
    })),
    limitations: [
      'ISOLATED TEST FIXTURE: no real model inference.',
      'Reported locations do not establish scientific claim support.',
    ],
  };
  const json = JSON.stringify(answer);
  const result = {
    id: 'resp_fixture',
    object: 'response',
    created_at: 1,
    status: 'completed',
    error: null,
    incomplete_details: null,
    model: body.model,
    output: [
      {
        type: 'message',
        id: 'msg_fixture',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: json, annotations: [] }],
      },
    ],
    usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
  };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
  });
  const emit = (e) =>
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  const delay = prompt.includes('fixture-slow') ? 300 : 20;
  for (let i = 0; i < json.length; i += 40) {
    if (res.destroyed) return;
    emit({ type: 'response.output_text.delta', delta: json.slice(i, i + 40) });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (!res.destroyed) {
    emit({ type: 'response.completed', response: result });
    res.end();
  }
});
server.listen(Number(process.env.ATLAS_AI_FIXTURE_PORT ?? '3198'), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
