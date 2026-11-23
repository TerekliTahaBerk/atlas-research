import assert from "node:assert/strict";
import test from "node:test";
import {
  ADD_ONS,
  BILLING_CURRENCY,
  DEFAULT_TEAM_AI_MEMBER_PERCENT,
  FOUNDING_DURATION_DAYS,
  FOUNDING_EXTENSION_MAX_DAYS,
  FOUNDING_FEEDBACK_DAY,
  FOUNDING_FIRST_YEAR_DISCOUNT_PERCENT,
  FOUNDING_OFFER_DAY,
  FOUNDING_PROFILES,
  GB,
  MB,
  MINUTE_MS,
  PLAN_VERSION,
  formatUsd,
  priceFor,
  resolveFoundingLimits,
  resolvePlanLimits,
  type FoundingProfile,
} from "../../src/lib/pricing";

test("catalog lists versioned USD minor-unit prices with no annual academic checkout", () => {
  assert.match(PLAN_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(BILLING_CURRENCY, "USD");
  assert.equal(priceFor("FREE", "monthly"), 0);
  assert.equal(priceFor("PLUS", "yearly"), 9000);
  assert.equal(priceFor("PRO", "monthly"), 1900);
  assert.equal(priceFor("TEAM", "monthly", 3), 4500);
  assert.equal(priceFor("TEAM", "yearly", 5), 75000);
  assert.equal(priceFor("INSTITUTION", "monthly"), null);
  assert.equal(priceFor("PLUS_STUDENT", "monthly"), 450);
  assert.equal(priceFor("PRO_STUDENT", "monthly"), 950);
  assert.equal(priceFor("PLUS_STUDENT", "yearly"), null);
  assert.equal(priceFor("PRO_STUDENT", "yearly"), null);
  assert.equal(formatUsd(450), "$4.50");
});

test("each personal plan has the intended capacity and student overrides are limited to AI credits", () => {
  const free = resolvePlanLimits("FREE");
  const plus = resolvePlanLimits("PLUS");
  const pro = resolvePlanLimits("PRO");
  assert.equal(free.activeProjects, 3);
  assert.equal(plus.activeProjects, 25);
  assert.equal(pro.activeProjects, 100);
  assert.equal(free.storageBytes, GB);
  assert.equal(free.maxFileBytes, 10 * MB);
  assert.equal(plus.indexedBytes, 500 * MB);
  assert.equal(pro.monthlyPythonMilliseconds, 600 * MINUTE_MS);
  assert.equal(pro.maxPythonRunMilliseconds, 15 * MINUTE_MS);
  assert.equal(resolvePlanLimits("PRO", 10).storageBytes, pro.storageBytes);
  assert.deepEqual(resolvePlanLimits("PLUS_STUDENT"), {
    ...plus,
    monthlyAiCredits: 100,
  });
  assert.deepEqual(resolvePlanLimits("PRO_STUDENT"), {
    ...pro,
    monthlyAiCredits: 250,
  });
  assert.throws(() => resolvePlanLimits("INSTITUTION"), RangeError);
});

test("Team formula includes a flat 50-project base and distinct per-seat and per-user limits", () => {
  assert.deepEqual(resolvePlanLimits("TEAM", 5), {
    activeProjects: 150,
    storageBytes: 75 * GB,
    maxFileBytes: 100 * MB,
    monthlyUploads: 1500,
    monthlyAiCredits: 1250,
    dailyAiOperationsPerMember: 30,
    indexedBytes: 5 * GB,
    monthlyPythonMilliseconds: 1500 * MINUTE_MS,
    maxPythonRunMilliseconds: 15 * MINUTE_MS,
    monthlyLatexCompiles: 1250,
    automations: 75,
  });
  assert.equal(resolvePlanLimits("TEAM").activeProjects, 110);
  assert.equal(DEFAULT_TEAM_AI_MEMBER_PERCENT, 40);
  for (const seats of [0, 2, 3.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => resolvePlanLimits("TEAM", seats), RangeError);
  }
});

test("Founding cohorts inherit their base allowances and total only the approved pilot capacity", () => {
  const profiles = Object.entries(FOUNDING_PROFILES) as [
    FoundingProfile,
    (typeof FOUNDING_PROFILES)[FoundingProfile],
  ][];
  assert.deepEqual(
    profiles.map(([, profile]) => profile.capacity),
    [20, 15, 10, 5],
  );
  assert.equal(
    profiles.reduce((sum, [, profile]) => sum + profile.capacity, 0),
    50,
  );
  assert.equal(
    profiles.reduce(
      (sum, [, profile]) => sum + profile.capacity * profile.seats,
      0,
    ),
    135,
  );
  assert.equal(
    profiles.reduce(
      (sum, [key, profile]) =>
        sum + profile.capacity * resolveFoundingLimits(key).monthlyAiCredits,
      0,
    ),
    13550,
  );
  assert.deepEqual(
    profiles.map(
      ([key]) =>
        resolveFoundingLimits(key).monthlyPythonMilliseconds / MINUTE_MS,
    ),
    [120, 300, 600, 1000],
  );
  assert.deepEqual(
    profiles.map(([key]) => resolveFoundingLimits(key).storageBytes / GB),
    [5, 20, 75, 150],
  );
  for (const [key, profile] of profiles) {
    const founding = resolveFoundingLimits(key);
    const base = resolvePlanLimits(profile.basePlan, profile.seats);
    assert.equal(founding.activeProjects, base.activeProjects);
    assert.equal(founding.indexedBytes, base.indexedBytes);
    assert.equal(founding.monthlyLatexCompiles, base.monthlyLatexCompiles);
  }
  assert.deepEqual(
    [
      FOUNDING_FEEDBACK_DAY,
      FOUNDING_OFFER_DAY,
      FOUNDING_DURATION_DAYS,
      FOUNDING_EXTENSION_MAX_DAYS,
      FOUNDING_FIRST_YEAR_DISCOUNT_PERCENT,
    ],
    [60, 75, 90, 30, 30],
  );
});

test("one-time add-on packages expire and recurring additions require a compatible paid plan", () => {
  assert.equal(ADD_ONS.AI_100.cents, 300);
  assert.equal(ADD_ONS.AI_500.cents, 1200);
  assert.equal(ADD_ONS.AI_100.validMonths, 12);
  assert.equal(ADD_ONS.AI_500.validMonths, 12);
  assert.equal(ADD_ONS.STORAGE_10_GB.quantity, 10 * GB);
  assert.equal(ADD_ONS.STORAGE_10_GB.mode, "monthly");
  assert.equal(ADD_ONS.PYTHON_100_MINUTES.quantity, 100 * MINUTE_MS);
  assert.equal(ADD_ONS.PYTHON_100_MINUTES.validMonths, 12);
  assert.deepEqual(ADD_ONS.TEAM_SEAT.compatiblePlans, ["TEAM"]);
});
