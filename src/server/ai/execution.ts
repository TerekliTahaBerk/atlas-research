import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { AppError } from "../errors";
import { resolveWorkspaceEntitlement } from "../billing/entitlements";
import { settleResource } from "../billing/ledger";
import {
  aiConfig,
  openAIProvider,
  reservation,
  TERMS,
  type Provider,
} from "./provider";
import {
  creditsForSuccessfulRun,
  meteredMicros,
  providerPricing,
  type ProviderPricing,
} from "./pricing";
import {
  aiScope,
  budgetLock,
  contextData,
  controllers,
  policyRow,
  validateAnswer,
  validateEvidence,
  providerInput,
  unavailable,
  json,
} from "./service";

type KnownCost = {
  chargedMicros: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWrite30mTokens: number;
  cacheWrite12hTokens: number;
  providerCostState: "actual";
};

function actualCost(
  pricing: ProviderPricing,
  response: Awaited<ReturnType<Provider>>,
): KnownCost {
  if (response.model !== pricing.model)
    throw new AppError("AI_PROVIDER_ERROR", 502);
  return {
    chargedMicros: meteredMicros(pricing, response),
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cachedInputTokens: response.cachedInputTokens ?? 0,
    cacheWrite30mTokens: response.cacheWrite30mTokens ?? 0,
    cacheWrite12hTokens: response.cacheWrite12hTokens ?? 0,
    providerCostState: "actual",
  };
}

export async function executeRun(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  provider: Provider = openAIProvider,
) {
  const controller = new AbortController();
  if (controllers.has(id)) return;
  controllers.set(id, controller);
  const timeout = setTimeout(() => controller.abort(), 45000);
  let observedCost: KnownCost | undefined;
  let dispatched = false;
  try {
    const work = await aiScope(db, a, w, p, true, async (tx) => {
      await budgetLock(tx, w, a);
      const run = await tx.aiRun.findFirst({
        where: {
          id,
          workspaceId: w,
          projectId: p,
          userId: a.id,
          sessionId: a.sessionId,
        },
      });
      if (!run) unavailable();
      if (run.state !== "queued") return null;
      const policy = await policyRow(tx, w);
      const config = aiConfig();
      const pricing =
        run.pricingVersion && providerPricing(run.model, run.pricingVersion);
      if (
        !config.callsEnabled ||
        !config.keyConfigured ||
        !pricing ||
        config.model !== run.model ||
        !policy.enabled ||
        policy.revision !== run.policyRevision ||
        policy.termsVersion !== TERMS
      )
        throw new AppError("AI_DISABLED", 409);
      const data = await contextData(tx, a, w, p, run.contextId);
      if (
        data.context.expiresAt.getTime() < Date.now() ||
        controller.signal.aborted
      )
        throw new AppError("AI_CONTEXT_EXPIRED", 409);
      const entitlement = await resolveWorkspaceEntitlement(tx, w);
      if (
        run.founding !== Boolean(entitlement.foundingProfile) ||
        (run.founding &&
          run.createdAt.toISOString().slice(0, 7) !==
            new Date().toISOString().slice(0, 7))
      )
        throw new AppError("AI_CONTEXT_EXPIRED", 409);
      await validateEvidence(tx, w, p, data, true);
      const input = { ...providerInput(data), model: pricing.model };
      if (reservation(input, pricing).micros > run.reservedMicros)
        throw new AppError("AI_LIMITED", 429);
      await tx.aiRun.update({
        where: { id },
        data: { state: "running", dispatchedAt: new Date() },
      });
      return { input, pricing };
    });
    if (!work) return;
    dispatched = true;
    // No database lock is held while waiting for the provider. There are no provider retries.
    const response = await provider(work.input, controller.signal);
    const cost = actualCost(work.pricing, response);
    observedCost = cost;
    await aiScope(db, a, w, p, true, async (tx) => {
      await budgetLock(tx, w, a);
      const run = await tx.aiRun.findFirst({
        where: {
          id,
          workspaceId: w,
          projectId: p,
          userId: a.id,
          sessionId: a.sessionId,
        },
      });
      if (!run) unavailable();
      if (run.state !== "running") return;
      const policy = await policyRow(tx, w);
      if (
        !aiConfig().callsEnabled ||
        !policy.enabled ||
        policy.revision !== run.policyRevision
      )
        throw new AppError("AI_DISABLED", 409);
      const data = await contextData(tx, a, w, p, run.contextId);
      await validateEvidence(tx, w, p, data, true);
      const finalCredits = creditsForSuccessfulRun(cost.chargedMicros);
      if (
        cost.chargedMicros > run.reservedMicros ||
        (run.reservedCredits > 0 && finalCredits > run.reservedCredits)
      )
        throw new AppError("AI_PROVIDER_ERROR", 502);
      let answer;
      try {
        answer = validateAnswer(response.answer, work.input.evidence);
      } catch {
        if (run.reservedCredits)
          await settleResource(tx, {
            workspaceId: w,
            actorId: a.id,
            resource: "aiCredits",
            operationId: run.id,
            quantity: 0,
            outcome: "release",
          });
        await tx.aiRun.update({
          where: { id },
          data: {
            ...cost,
            state: "validation_failed",
            error: "UNVERIFIED_CITATION",
            completedAt: new Date(),
          },
        });
        return;
      }
      if (run.reservedCredits)
        await settleResource(tx, {
          workspaceId: w,
          actorId: a.id,
          resource: "aiCredits",
          operationId: run.id,
          quantity: finalCredits,
          outcome: "settle",
        });
      await tx.aiRun.update({
        where: { id },
        data: {
          ...cost,
          state: answer.status === "answered" ? "complete" : "insufficient",
          result: json(answer),
          chargedCredits: run.reservedCredits ? finalCredits : 0,
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    // If access is gone, the fixed expiry path releases credits without reading private content.
    try {
      await aiScope(db, a, w, p, false, async (tx) => {
        await budgetLock(tx, w, a);
        const run = await tx.aiRun.findFirst({
          where: { id, workspaceId: w, projectId: p, userId: a.id },
        });
        if (!run || !["queued", "running"].includes(run.state)) return;
        if (run.reservedCredits)
          await settleResource(tx, {
            workspaceId: w,
            actorId: a.id,
            resource: "aiCredits",
            operationId: run.id,
            quantity: 0,
            outcome: "release",
          });
        const uncertain = Boolean(dispatched || run.dispatchedAt);
        await tx.aiRun.update({
          where: { id },
          data: {
            ...(observedCost ?? {
              chargedMicros: uncertain ? run.reservedMicros : 0,
              providerCostState: !run.pricingVersion
                ? "legacy"
                : uncertain
                  ? "uncertain"
                  : "released",
            }),
            state: controller.signal.aborted ? "cancelled" : "provider_error",
            error:
              error instanceof AppError
                ? error.code
                : controller.signal.aborted
                  ? "TIMEOUT_UNCERTAIN"
                  : "PROVIDER_UNAVAILABLE",
            completedAt: new Date(),
          },
        });
      });
    } catch {
      /* No raw prompt, provider response, credential or database error is logged. */
    }
  } finally {
    clearTimeout(timeout);
    controllers.delete(id);
  }
}
