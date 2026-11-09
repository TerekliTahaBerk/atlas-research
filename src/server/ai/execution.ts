import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { AppError } from "../errors";
import {
  aiConfig,
  openAIProvider,
  TERMS,
  usageCharge,
  type Provider,
} from "./provider";
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
  let dispatched = false;
  try {
    const input = await aiScope(db, a, w, p, true, async (tx) => {
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
      const policy = await policyRow(tx, w),
        config = aiConfig();
      if (
        !config.callsEnabled ||
        !config.keyConfigured ||
        !policy.enabled ||
        policy.revision !== run.policyRevision ||
        policy.termsVersion !== TERMS
      )
        throw new AppError("AI_DISABLED", 409);
      const data = await contextData(tx, a, w, p, run.contextId);
      if (data.context.expiresAt.getTime() < Date.now())
        throw new AppError("AI_CONTEXT_EXPIRED", 409);
      await validateEvidence(tx, w, p, data);
      await tx.aiRun.update({
        where: { id },
        data: { state: "running", dispatchedAt: new Date() },
      });
      return providerInput(data);
    });
    if (!input) return;
    dispatched = true;
    // No database lock or transaction is held while waiting for the provider. No automatic retries.
    const response = await provider(input, controller.signal);
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
      await validateEvidence(tx, w, p, data);
      if (
        !Number.isInteger(response.inputTokens) ||
        !Number.isInteger(response.outputTokens) ||
        response.inputTokens < 0 ||
        response.outputTokens < 0 ||
        response.outputTokens > 2000 ||
        response.inputTokens > 60000 ||
        response.model !== run.model
      )
        throw new AppError("AI_PROVIDER_ERROR", 502);
      const charged = usageCharge(response.inputTokens, response.outputTokens);
      if (charged > run.reservedMicros)
        throw new AppError("AI_PROVIDER_ERROR", 502);
      let answer;
      try {
        answer = validateAnswer(response.answer, input.evidence);
      } catch {
        await tx.aiRun.update({
          where: { id },
          data: {
            state: "validation_failed",
            error: "UNVERIFIED_CITATION",
            chargedMicros: charged,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            completedAt: new Date(),
          },
        });
        return;
      }
      await tx.aiRun.update({
        where: { id },
        data: {
          state: answer.status === "answered" ? "complete" : "insufficient",
          result: json(answer),
          chargedMicros: charged,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    // If access/session is gone, leave the lease to the fixed expiry function: it conservatively settles any dispatched cost without reading private content.
    try {
      await aiScope(db, a, w, p, false, async (tx) => {
        await budgetLock(tx, w, a);
        const run = await tx.aiRun.findFirst({
          where: { id, workspaceId: w, projectId: p, userId: a.id },
        });
        if (run && ["queued", "running"].includes(run.state))
          await tx.aiRun.update({
            where: { id },
            data: {
              state: controller.signal.aborted ? "cancelled" : "provider_error",
              error:
                error instanceof AppError
                  ? error.code
                  : controller.signal.aborted
                    ? "TIMEOUT_UNCERTAIN"
                    : "PROVIDER_UNAVAILABLE",
              chargedMicros:
                dispatched || run.dispatchedAt ? run.reservedMicros : 0,
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
