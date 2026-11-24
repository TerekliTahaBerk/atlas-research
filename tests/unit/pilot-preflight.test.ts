import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPilotPublicRelease,
  parsePilotTarget,
} from "../../scripts/pilot-preflight";

const origin = "https://atlas.example";
const release = "0123456789abcdef0123456789abcdef01234567";
const schema = "202611240104_compute_jobs";
const target = parsePilotTarget([origin, release, schema]);

function publicResponses({ mismatch = false, reuseNonce = false } = {}) {
  const seen: URL[] = [];
  let signIns = 0;
  const request: typeof fetch = async (input, init) => {
    assert.ok(input instanceof URL);
    assert.equal(input.origin, origin);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.headers, undefined);
    seen.push(input);
    const json = (payload: unknown, status = 200) =>
      Response.json(payload, {
        status,
        headers: { "cache-control": "private, no-store" },
      });
    switch (input.pathname) {
      case "/health/live":
        return json({ status: "ok" });
      case "/health/ready":
        return json({
          status: "ready",
          release: mismatch ? "unexpected" : release,
          schema,
        });
      case "/api/capabilities":
        return json({ emailDelivery: "disabled" });
      case "/api/me":
      case "/api/compute":
        return json(
          { error: "UNAUTHENTICATED", requestId: "never printed" },
          401,
        );
      case "/pricing":
        return new Response(
          "Checkout and custom automations are unavailable here.",
        );
      case "/sign-in": {
        const nonce = `unique-${reuseNonce ? 0 : ++signIns}`;
        return new Response(`<script nonce="${nonce}"></script>`, {
          headers: {
            "content-security-policy": `script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
            "strict-transport-security": "max-age=31536000",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        });
      }
      default:
        throw new Error("Unexpected probe route");
    }
  };
  return { request, seen };
}

test("pilot preflight checks the anonymous public release without sending credentials", async () => {
  const { request, seen } = publicResponses();
  const report = await checkPilotPublicRelease(target, request);
  assert.equal(report.result, "PASS");
  assert.equal(report.checks.length, 7);
  assert.equal(seen.length, 8);
  assert.doesNotMatch(JSON.stringify(report), /never printed|unique-/);
});

test("pilot preflight rejects the wrong build and a cached sign-in nonce", async () => {
  const { request } = publicResponses({ mismatch: true, reuseNonce: true });
  const report = await checkPilotPublicRelease(target, request);
  assert.equal(report.result, "FAIL");
  assert.deepEqual(
    report.checks
      .filter(({ result }) => result === "FAIL")
      .map(({ check }) => check),
    ["expected_release_and_schema", "sign_in_headers_and_fresh_nonce"],
  );
});

test("pilot preflight refuses insecure or credential-bearing addresses and incomplete revisions", () => {
  for (const value of [
    "http://atlas.example",
    "https://alice:secret@atlas.example",
    `${origin}/sign-in`,
    `${origin}?token=secret`,
  ]) {
    assert.throws(() => parsePilotTarget([value, release, schema]));
  }
  assert.throws(() => parsePilotTarget([origin, release.slice(0, 7), schema]));
  assert.throws(() => parsePilotTarget([origin, release, "latest"]));
});
