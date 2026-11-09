import { test } from "node:test";
import assert from "node:assert/strict";
const empty = { observed: false, numerator: 0, denominator: 0 };
const template = {
  version: 1,
  evidence: "observed",
  participants: 0,
  teams: 0,
  supportAssigned: false,
  activationWindowComplete: false,
  returnWindowComplete: false,
  M1: empty,
  M2: empty,
  M3: empty,
  M4: empty,
  M5: empty,
  M6: empty,
  M7: {
    observed: false,
    papers: 0,
    questions: 0,
    locators: empty,
    claims: empty,
    abstentions: empty,
    leaks: 0,
  },
};
import { summarizePilot } from "../../src/lib/pilot-metrics";
import { proxy } from "../../src/proxy";
import { NextRequest } from "next/server";
test("empty pilot observations cannot become percentages or beta acceptance", () => {
  const r = summarizePilot(template);
  for (const m of Object.values(r.metrics)) assert.equal(m.status, "NOT RUN");
  assert.match(r.releaseDecision, /OWNER REVIEW/);
  assert.throws(() =>
    summarizePilot({ ...template, email: "private@example.invalid" }),
  );
  assert.throws(() =>
    summarizePilot({
      ...template,
      M1: { observed: true, numerator: 2, denominator: 1 },
    }),
  );
});
test("synthetic outcomes and incomplete windows cannot be presented as real pilot results", () => {
  const r = summarizePilot({
    ...template,
    evidence: "synthetic",
    M2: { observed: true, numerator: 8, denominator: 10 },
  });
  assert.equal(r.metrics.M2.status, "SYNTHETIC ONLY");
  assert.equal(
    summarizePilot({
      ...template,
      M1: { observed: true, numerator: 1, denominator: 1 },
    }).metrics.M1.status,
    "NOT RUN",
  );
});
test("CSP nonce is fresh and overwrites caller headers; HSTS applies only to configured HTTPS app", () => {
  const previous = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = "https://atlas.example.invalid";
    const a = proxy(
        new NextRequest("https://atlas.example.invalid", {
          headers: {
            "x-atlas-nonce": "attacker",
            "Content-Security-Policy": "script-src *",
          },
        }),
      ),
      b = proxy(new NextRequest("https://atlas.example.invalid"));
    const csp = a.headers.get("Content-Security-Policy")!;
    assert.notEqual(csp, b.headers.get("Content-Security-Policy"));
    assert.match(csp, /strict-dynamic/);
    assert.doesNotMatch(csp, /nonce-attacker/);
    assert.match(
      a.headers.get("Strict-Transport-Security")!,
      /max-age=31536000/,
    );
    process.env.APP_ORIGIN = "http://127.0.0.1";
    assert.equal(
      proxy(new NextRequest("http://127.0.0.1")).headers.get(
        "Strict-Transport-Security",
      ),
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
