import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(public code: "UNAVAILABLE" | "INVALID_INPUT" | "CONFLICT" | "UNAUTHENTICATED" | "REAUTH_REQUIRED" | "OWNER_REQUIRED" | "ARCHIVED" | "RATE_LIMITED" | "MAIL_DISABLED" | "INVALID_DOI" | "INVALID_URL" | "PROVIDER_BUSY" | "PROVIDER_UNAVAILABLE" | "REVISION_CONFLICT" | "DUPLICATE_SOURCE" | "STORAGE_UNAVAILABLE" | "FILE_TOO_LARGE" | "INVALID_PDF" | "UPLOAD_IN_PROGRESS" | "STORAGE_QUOTA" | "UPLOAD_FAILED", public status = 400) {
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
  const kind=error instanceof TypeError?"TypeError":error instanceof Error?"Error":"Unknown";
  if (!known) console.error(JSON.stringify({ event: "request_failed", requestId, code,kind }));
  return Response.json({ error: code, requestId }, { status: known?.status ?? 500, headers: { "Cache-Control": "private, no-store", ...(known?.status===429?{"Retry-After":"60"}:{}) } });
}
