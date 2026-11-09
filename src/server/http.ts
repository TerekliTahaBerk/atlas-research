import { z } from "zod";
import { getEnv } from "./env";
import { AppError } from "./errors";
import { readLimitedBody } from "./body";
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function readMutation<T>(request: Request, schema: z.ZodType<T>, maximum=8192): Promise<T> {
  if (request.headers.get("origin") !== getEnv().APP_ORIGIN || !request.headers.get("content-type")?.startsWith("application/json")) {
    throw new AppError("INVALID_INPUT", 403);
  }
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new AppError("INVALID_INPUT", 413);
  const text = (await readLimitedBody(request,maximum)).toString("utf8");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AppError("INVALID_INPUT"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_INPUT");
  return parsed.data;
}
