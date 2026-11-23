import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { asIdentity } from "../db/transaction";
import type { Tx } from "../domain/access";
import { AppError } from "../errors";
import { asBillingOperator, billingAudit } from "./operations";

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/);
export const academicInput = z.object({ institutionDomain: domain }).strict();
export const academicReviewInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("institution"),
      domain,
      name: z.string().trim().min(2).max(180),
      verificationUrl: z
        .url()
        .max(400)
        .refine((value) => value.startsWith("https://")),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      actorId: z.string().min(1).max(150),
      decision: z.enum(["verify", "reject"]),
      reason: z.string().trim().min(6).max(500),
      expiresInDays: z.number().int().min(1).max(365).optional(),
      enrollmentConfirmed: z.boolean().optional(),
    })
    .strict(),
]);

async function currentAcademicIdentity(
  tx: Tx,
  actorId: string,
  institutionDomain: string,
) {
  const [result] = await tx.$queryRaw<
    Array<{ valid: boolean }>
  >`SELECT app.academic_identity_current(${actorId},${institutionDomain}) AS valid`;
  return result?.valid === true;
}
export async function eligibleStudent(tx: Tx, actorId: string) {
  const row = await tx.academicEligibility.findUnique({ where: { actorId } });
  return Boolean(
    row?.status === "verified" &&
    row.expiresAt &&
    row.expiresAt > new Date() &&
    (await currentAcademicIdentity(tx, actorId, row.institutionDomain)),
  );
}
async function academicStatus(tx: Tx, actor: Identity) {
  const row = await tx.academicEligibility.findUnique({
    where: { actorId: actor.id },
  });
  if (!row) return { status: null, institutionDomain: null, expiresAt: null };
  const status =
    row.status === "verified" && !(await eligibleStudent(tx, actor.id))
      ? "expired"
      : row.status;
  return {
    status,
    institutionDomain: row.institutionDomain,
    expiresAt: row.expiresAt,
    renewalPending:
      status === "verified" &&
      row.verifiedAt !== null &&
      row.requestedAt > row.verifiedAt,
  };
}
export function readAcademicStatus(db: Database, actor: Identity) {
  return asIdentity(db, actor, (tx) => academicStatus(tx, actor));
}
export function requestAcademicStatus(
  db: Database,
  actor: Identity,
  institutionDomain: string,
) {
  return asIdentity(db, actor, async (tx) => {
    const [result] = await tx.$queryRaw<
      Array<{ available: boolean }>
    >`SELECT app.request_academic_eligibility(${institutionDomain}) AS available`;
    if (!result?.available) throw new AppError("ACADEMIC_UNAVAILABLE", 409);
    return academicStatus(tx, actor);
  });
}
export function reviewAcademic(
  db: Database,
  actor: Identity,
  input: z.output<typeof academicReviewInput>,
) {
  return asBillingOperator(db, actor, true, async (tx) => {
    if (input.action === "institution") {
      const { domain: key, active, name, verificationUrl } = input;
      await tx.academicInstitution.upsert({
        where: { domain: key },
        create: { domain: key, active, name, verificationUrl },
        update: { active, name, verificationUrl },
      });
      await billingAudit(tx, actor, "academic_institution_recorded", key, {
        active,
      });
      return { ok: true };
    }
    const row = await tx.academicEligibility.findUnique({
      where: { actorId: input.actorId },
    });
    if (!row) throw new AppError("UNAVAILABLE", 404);
    const verified = input.decision === "verify";
    if (
      verified &&
      (!input.enrollmentConfirmed ||
        !(await currentAcademicIdentity(
          tx,
          input.actorId,
          row.institutionDomain,
        )))
    ) {
      throw new AppError("ACADEMIC_UNAVAILABLE", 409);
    }
    const now = new Date();
    const expiresAt = verified
      ? new Date(now.getTime() + (input.expiresInDays ?? 365) * 86_400_000)
      : null;
    await tx.academicEligibility.update({
      where: { actorId: row.actorId },
      data: {
        status: verified ? "verified" : "rejected",
        verifiedAt: verified ? now : null,
        expiresAt,
      },
    });
    await billingAudit(tx, actor, "academic_" + input.decision, row.actorId, {
      reason: input.reason,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    return { ok: true };
  });
}
