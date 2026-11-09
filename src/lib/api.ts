"use client";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(code);
  }
}
export async function api<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "NETWORK_ERROR");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.code ?? data.error ?? data.code ?? "UNAVAILABLE",
      data.requestId,
    );
  return data;
}
export function message(error: unknown) {
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  const research: Record<string, string> = {
    INVALID_DOI: "Enter a DOI such as 10.1234/example or its doi.org link.",
    INVALID_URL: "Enter a valid http or https article link.",
    PROVIDER_BUSY: "Crossref is busy. Wait a moment and search again.",
    PROVIDER_UNAVAILABLE:
      "Crossref could not respond. Try again, or add the source manually.",
    REVISION_CONFLICT:
      "Someone changed this record. Refresh before saving again.",
    DUPLICATE_SOURCE:
      "This DOI or article link is already in this project’s library.",
    STORAGE_UNAVAILABLE:
      "PDF storage is temporarily unavailable. Your source details are still saved.",
    FILE_TOO_LARGE: "Choose a PDF of 25 MB or less.",
    INVALID_PDF:
      "This file does not look like a complete PDF. Choose another copy.",
    UPLOAD_IN_PROGRESS:
      "This upload is already being processed. Refresh, or try again shortly.",
    STORAGE_QUOTA: "This project has reached its 250 MB PDF storage limit.",
    UPLOAD_FAILED:
      "The PDF could not be saved. Your source details are safe; try the upload again.",
  };
  if (research[code]) return research[code];
  if (code === "MAIL_DISABLED")
    return "Email delivery is currently unavailable. Please contact your workspace administrator.";
  if (code === "REAUTH_REQUIRED")
    return "Sign in again before changing ownership or requesting deletion.";
  if (code === "ARCHIVED")
    return "This workspace or project is archived. Restore it before making changes.";
  if (code === "CONFLICT" || code === "OWNER_REQUIRED")
    return "This change could not be saved. Transfer ownership before removing an owner, or refresh and try again.";
  if (code === "NETWORK_ERROR")
    return "Could not connect. Your input is still here; please try again.";
  if (error instanceof ApiError && error.status === 429)
    return "Too many attempts. Wait one minute and try again.";
  return "This action could not be completed. Check your input and access, then try again.";
}
export function safeReturn(value: string | null) {
  return value && /^\/(home|onboarding|settings|w|invite)(\/|\?|$)/.test(value)
    ? value
    : "/home";
}
