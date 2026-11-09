import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(public code: "UNAVAILABLE" | "INVALID_INPUT" | "CONFLICT" | "UNAUTHENTICATED", public status = 400) {
    super(code);
  }
}

export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  const known = error instanceof AppError;
  const code = known ? error.code : "INTERNAL_ERROR";
  if (!known) console.error(JSON.stringify({ event: "request_failed", requestId, code }));
  return Response.json({ error: code, requestId }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
