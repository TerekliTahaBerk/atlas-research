import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(public code: "UNAVAILABLE" | "INVALID_INPUT" | "CONFLICT" | "UNAUTHENTICATED" | "REAUTH_REQUIRED" | "OWNER_REQUIRED" | "ARCHIVED" | "RATE_LIMITED", public status = 400) {
    super(code);
  }
}

export function errorResponse(error: unknown) {
  if (!(error instanceof AppError) && error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "P2025") error = new AppError("UNAVAILABLE", 404);
    else if (["P2002", "P2003", "P2004"].includes(code)) error = new AppError("CONFLICT", 409);
    else if (code === "P2010") {
      const meta = "meta" in error && error.meta && typeof error.meta === "object" ? error.meta as Record<string, unknown> : {};
      error = new AppError(meta.code === "23514" ? "CONFLICT" : "UNAVAILABLE", meta.code === "23514" ? 409 : 404);
    }
  }
  const requestId = randomUUID();
  const known = error instanceof AppError ? error : null;
  const code = known?.code ?? "INTERNAL_ERROR";
  if (!known) console.error(JSON.stringify({ event: "request_failed", requestId, code }));
  return Response.json({ error: code, requestId }, { status: known?.status ?? 500, headers: { "Cache-Control": "private, no-store", ...(known?.status===429?{"Retry-After":"60"}:{}) } });
}
