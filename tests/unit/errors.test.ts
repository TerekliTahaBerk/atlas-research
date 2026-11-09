import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError, errorResponse } from "../../src/server/errors";

test("safe domain error contains a correlation ID, never a raw exception", async () => {
  const response = errorResponse(new AppError("UNAVAILABLE", 404));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["error", "requestId"]);
  assert.equal(body.error, "UNAVAILABLE");
  assert.match(body.requestId, /^[\da-f-]{36}$/);
});
