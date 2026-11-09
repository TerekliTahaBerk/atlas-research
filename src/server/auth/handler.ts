import type { Auth } from "./identity";
import type { ServerEnv } from "../env";
import { AppError, errorResponse } from "../errors";
import { readLimitedBody } from "../body";

export function createAuthHandler(auth: Auth, env: ServerEnv) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method === "POST") {
        if (request.headers.get("origin") !== env.APP_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("INVALID_INPUT", 403);
        if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("INVALID_INPUT", 415);
        const body = await readLimitedBody(request);
        const headers = new Headers(request.headers);
        // The production proxy must overwrite x-real-ip; missing IP shares one restrictive bucket.
        if (!headers.has("x-real-ip")) headers.set("x-real-ip", "0.0.0.0");
        request = new Request(request.url, { method: request.method, headers, body });
      }
      const response = await auth.handler(request);
      response.headers.set("Cache-Control", "private, no-store");
      if (response.status === 429 && !response.headers.has("Retry-After")) response.headers.set("Retry-After", "60");
      return response;
    } catch (error) { return errorResponse(error); }
  };
}
