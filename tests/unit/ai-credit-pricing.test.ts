import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MODEL,
  PRICING_VERSION,
  creditsForSuccessfulRun,
  meteredMicros,
  parseOpenAIMeters,
  providerPricing,
  reservationForProvider,
} from "../../src/server/ai/pricing";
import {
  openAIProvider,
  requestBody,
  reservation,
} from "../../src/server/ai/provider";

const rates = providerPricing(DEFAULT_MODEL)!;

test("versioned AI rates reject unknown models and calculate integer USD micros and credits", () => {
  assert.equal(rates.version, PRICING_VERSION);
  assert.equal(providerPricing("unknown"), null);
  assert.equal(providerPricing(DEFAULT_MODEL, "retired"), null);
  assert.deepEqual(reservationForProvider(rates), {
    micros: 8500,
    credits: 1,
    pricingVersion: PRICING_VERSION,
  });
  assert.equal(creditsForSuccessfulRun(0), 1);
  assert.equal(creditsForSuccessfulRun(10_000), 1);
  assert.equal(creditsForSuccessfulRun(10_001), 2);

  const usage = parseOpenAIMeters(
    {
      input_tokens: 1500,
      output_tokens: 250,
      input_tokens_details: {
        cached_tokens: 450,
        cache_write_tokens: 500,
        cache_write_tokens_details: {
          ttl_30m_tokens: 300,
          ttl_12h_tokens: 200,
        },
      },
      output_tokens_details: { reasoning_tokens: 100 },
    },
    rates,
  );
  assert.deepEqual(usage, {
    inputTokens: 1500,
    outputTokens: 250,
    cachedInputTokens: 450,
    cacheWrite30mTokens: 300,
    cacheWrite12hTokens: 200,
  });
  // Reasoning is in output_tokens and must not be counted a second time.
  assert.equal(meteredMicros(rates, usage), 272);
  assert.throws(() =>
    meteredMicros(rates, {
      inputTokens: 10,
      outputTokens: 1,
      cachedInputTokens: 20,
    }),
  );
  assert.throws(() =>
    meteredMicros(rates, { inputTokens: 61_000, outputTokens: 1 }),
  );
  assert.throws(() =>
    parseOpenAIMeters(
      {
        input_tokens: 20,
        output_tokens: 1,
        input_tokens_details: {
          cached_tokens: 0,
          cache_write_tokens: 10,
          cache_write_tokens_details: { ttl_30m_tokens: 8, ttl_12h_tokens: 3 },
        },
      },
      rates,
    ),
  );
});

test("the bounded request uses the quoted model, standard tier, cache policy and zero tools", () => {
  const input = {
    question: "Synthetic proof",
    evidence: [],
    model: DEFAULT_MODEL,
  };
  const body = requestBody(input, rates);
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.tool_choice, "none");
  assert.equal(body.service_tier, "default");
  assert.equal(body.max_output_tokens, rates.maxOutputTokens);
  assert.equal(body.prompt_cache_options.ttl, "30m");
  assert.throws(
    () => reservation({ ...input, question: "界".repeat(17_000) }, rates),
    /AI_INVALID_EVIDENCE/,
  );
});

test("provider response rejects tool usage outside its priced request contract", async (t) => {
  const enabled = process.env.ATLAS_AI_CALLS_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  const limits = process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
  t.after(() => {
    if (enabled === undefined) delete process.env.ATLAS_AI_CALLS_ENABLED;
    else process.env.ATLAS_AI_CALLS_ENABLED = enabled;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
    if (limits === undefined) delete process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
    else process.env.ATLAS_RESOURCE_LIMITS_ENABLED = limits;
  });
  process.env.ATLAS_AI_CALLS_ENABLED = "true";
  process.env.OPENAI_API_KEY = "atlas-synthetic-fixture";
  let paidTool = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "completed",
      model: DEFAULT_MODEL,
      service_tier: "default",
      // Deliberately invalid text, with valid independently billable metrics.
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "broken JSON" }],
        },
      ],
      tool_usage: { web_search: { num_requests: paidTool ? 1 : 0 } },
      usage: {
        input_tokens: 50,
        output_tokens: 40,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      },
    }),
  );
  const input = {
    question: "Local fixture",
    evidence: [],
    model: DEFAULT_MODEL,
  };
  const signal = new AbortController().signal;
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "0";
  await assert.rejects(openAIProvider(input, signal), /AI_DISABLED/);
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "1";
  const knownCost = await openAIProvider(input, signal);
  assert.equal(knownCost.answer, undefined);
  assert.equal(meteredMicros(rates, knownCost), 25);
  paidTool = true;
  await assert.rejects(openAIProvider(input, signal), /AI_PROVIDER_ERROR/);
});
