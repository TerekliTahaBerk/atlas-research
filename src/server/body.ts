import { AppError } from "./errors";

export async function readLimitedBody(request: Request, maximum = 8192) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { void reader.cancel().catch(() => {}); throw new AppError("INVALID_INPUT", 413); }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}
