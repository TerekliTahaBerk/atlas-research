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
