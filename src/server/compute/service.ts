import { createHash } from "node:crypto";
import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { inProject, type Tx } from "../domain/access";
import {
  lockUsage,
  resolveWorkspaceEntitlement,
} from "../billing/entitlements";
import { reserveResource, walletUsage } from "../billing/ledger";
import { AppError } from "../errors";
import { computeAvailable } from "./availability";

export const computeRequest = z
  .object({
    workspaceId: z.uuid(),
    projectId: z.uuid(),
    requestId: z.uuid(),
    kind: z.enum(["python", "latex"]),
    source: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.trim().length > 0 &&
          !value.includes("\0") &&
          Buffer.byteLength(value, "utf8") <= 32_768,
      ),
    timeoutMs: z.number().int().min(100).max(900_000).optional(),
  })
  .strict();

type Scope = { workspaceId: string; projectId: string };
type Mode = z.output<typeof computeRequest>["kind"];
const metered = {
  python: "pythonMilliseconds",
  latex: "latexCompiles",
} as const;
const latexTimeoutMs = 30_000;
const defaultTimeout = { python: 10_000, latex: latexTimeoutMs };

type JobView = {
  id: string;
  kind: Mode;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "timed_out"
    | "canceled"
    | "abandoned"
    | "output_limit";
  timeoutMs: number;
  elapsedMs: number | null;
  stdout: string;
  stderr: string;
  hasPdf: boolean;
  createdAt: Date;
  completedAt: Date | null;
  cancelRequested: boolean;
};

async function jobs(tx: Tx, scope: Scope, jobId: string | null) {
  return tx.$queryRaw<JobView[]>`SELECT id,kind,status,"timeoutMs","elapsedMs",
    CASE WHEN id=${jobId}::uuid AND "outputExpiresAt">now() THEN stdout ELSE '' END AS stdout,
    CASE WHEN id=${jobId}::uuid AND "outputExpiresAt">now() THEN stderr ELSE '' END AS stderr,
    (pdf IS NOT NULL AND "outputExpiresAt">now()) AS "hasPdf","createdAt","completedAt",
    (status='running' AND "cancelRequestedAt" IS NOT NULL) AS "cancelRequested"
    FROM ops.compute_jobs WHERE "workspaceId"=${scope.workspaceId}::uuid AND "projectId"=${scope.projectId}::uuid
    AND (${jobId}::uuid IS NULL OR id=${jobId}::uuid)
    ORDER BY "createdAt" DESC,id LIMIT 20`;
}

async function oneJob(tx: Tx, scope: Scope, jobId: string) {
  const [job] = await jobs(tx, scope, jobId);
  if (!job) throw new AppError("UNAVAILABLE", 404);
  return job;
}

async function canWrite(tx: Tx, scope: Scope) {
  const [row] = await tx.$queryRaw<
    Array<{ allowed: boolean }>
  >`SELECT app.can_write_research(${scope.workspaceId}::uuid,${scope.projectId}::uuid) AS allowed`;
  return row?.allowed === true;
}

export function readCompute(db: Database, actor: Identity, scope: Scope) {
  return inProject(
    db,
    actor,
    scope.workspaceId,
    scope.projectId,
    false,
    async (tx) => {
      const entitlement = await resolveWorkspaceEntitlement(
        tx,
        scope.workspaceId,
      );
      const { limits } = entitlement;
      const wallet = await walletUsage(
        tx,
        scope.workspaceId,
        entitlement.periodStart,
        new Date(),
      );
      const extraPython = wallet.topUps
        .filter((grant) => grant.resource === "pythonMilliseconds")
        .reduce((total, grant) => total + grant.remaining, 0);
      return {
        available: await computeAvailable(tx),
        canRun: await canWrite(tx, scope),
        limits: {
          pythonRemainingMs:
            Math.max(
              0,
              limits.monthlyPythonMilliseconds -
                wallet.included.monthlyPythonMilliseconds,
            ) + extraPython,
          pythonTimeoutMs: Math.min(900_000, limits.maxPythonRunMilliseconds),
          latexRemaining: Math.max(
            0,
            limits.monthlyLatexCompiles - wallet.included.monthlyLatexCompiles,
          ),
          latexTimeoutMs,
        },
        jobs: await jobs(tx, scope, null),
      };
    },
  );
}

export function enqueueCompute(
  db: Database,
  actor: Identity,
  input: z.output<typeof computeRequest>,
) {
  const { workspaceId, projectId, requestId, kind, source } = input;
  const sourceHash = createHash("sha256").update(source).digest("hex");
  return inProject(
    db,
    actor,
    workspaceId,
    projectId,
    false,
    async (tx, scope) => {
      if (!["owner", "admin", "editor"].includes(scope.projectRole))
        throw new AppError("UNAVAILABLE", 404);
      const { limits } = await resolveWorkspaceEntitlement(tx, workspaceId);
      const maximum =
        kind === "python"
          ? Math.min(limits.maxPythonRunMilliseconds, 900_000)
          : latexTimeoutMs;
      const timeoutMs =
        input.timeoutMs ?? Math.min(defaultTimeout[kind], maximum);
      await lockUsage(tx, workspaceId);
      const prior = await tx.computeJob.findUnique({
        where: { id: requestId },
        select: {
          workspaceId: true,
          projectId: true,
          actorId: true,
          kind: true,
          sourceHash: true,
          timeoutMs: true,
        },
      });
      if (prior) {
        if (
          prior.workspaceId !== workspaceId ||
          prior.projectId !== projectId ||
          prior.actorId !== actor.id ||
          prior.kind !== kind ||
          prior.sourceHash !== sourceHash ||
          (input.timeoutMs !== undefined && prior.timeoutMs !== input.timeoutMs)
        ) {
          throw new AppError("CONFLICT", 409);
        }
        return oneJob(tx, input, requestId);
      }
      if (
        scope.project.archivedAt ||
        scope.project.deletedAt ||
        scope.workspace.archivedAt
      )
        throw new AppError("ARCHIVED", 409);
      if (!(await canWrite(tx, input))) throw new AppError("UNAVAILABLE", 404);
      if (!(await computeAvailable(tx)))
        throw new AppError("COMPUTE_UNAVAILABLE", 503);
      if (timeoutMs < 100 || timeoutMs > maximum)
        throw new AppError("RESOURCE_QUOTA", 429);
      const [queue] = await tx.$queryRaw<
        Array<{ count: number }>
      >`SELECT app.compute_queue_depth(${workspaceId}::uuid) AS count`;
      if (queue.count >= 4) throw new AppError("RESOURCE_QUOTA", 429);

      const resource = metered[kind];
      await reserveResource(tx, {
        workspaceId,
        actorId: actor.id,
        resource,
        operationId: requestId,
        quantity: kind === "python" ? timeoutMs : 1,
      });
      await tx.computeJob.create({
        data: {
          id: requestId,
          workspaceId,
          projectId,
          actorId: actor.id,
          sessionId: actor.sessionId,
          kind,
          resource,
          sourceHash,
          source,
          timeoutMs,
        },
      });
      return oneJob(tx, input, requestId);
    },
  );
}

export function readComputeJob(
  db: Database,
  actor: Identity,
  scope: Scope,
  jobId: string,
) {
  return inProject(db, actor, scope.workspaceId, scope.projectId, false, (tx) =>
    oneJob(tx, scope, jobId),
  );
}

export function cancelCompute(
  db: Database,
  actor: Identity,
  scope: Scope,
  jobId: string,
) {
  return inProject(
    db,
    actor,
    scope.workspaceId,
    scope.projectId,
    false,
    async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ canceled: boolean }>>`
      SELECT app.cancel_compute_job(${scope.workspaceId}::uuid,${scope.projectId}::uuid,${jobId}::uuid) AS canceled`;
      if (!row?.canceled) throw new AppError("UNAVAILABLE", 404);
      return oneJob(tx, scope, jobId);
    },
  );
}

export function readComputePdf(
  db: Database,
  actor: Identity,
  scope: Scope,
  jobId: string,
) {
  return inProject(
    db,
    actor,
    scope.workspaceId,
    scope.projectId,
    false,
    async (tx) => {
      const result = await tx.computeJob.findFirst({
        where: {
          id: jobId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          actorId: actor.id,
          kind: "latex",
          status: "succeeded",
          outputExpiresAt: { gt: new Date() },
        },
        select: { pdf: true },
      });
      if (!result?.pdf) throw new AppError("UNAVAILABLE", 404);
      return new Response(new Uint8Array(result.pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="document.pdf"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  );
}
