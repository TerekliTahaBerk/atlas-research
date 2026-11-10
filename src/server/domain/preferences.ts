import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { AppError } from "../errors";
export const preferenceInput = z
  .object({
    assignment: z.boolean(),
    reply: z.boolean(),
    mention: z.boolean(),
    revision: z.number().int().min(0),
  })
  .strict();
export function preferences(db: Database, a: Identity) {
  return asIdentity(
    db,
    a,
    async (tx) =>
      (await tx.userPreference.findUnique({
        where: { actorId: a.id },
        select: {
          assignment: true,
          reply: true,
          mention: true,
          revision: true,
          updatedAt: true,
        },
      })) ?? {
        assignment: true,
        reply: true,
        mention: true,
        revision: 0,
        updatedAt: null,
      },
  );
}
export function savePreferences(
  db: Database,
  a: Identity,
  input: z.infer<typeof preferenceInput>,
) {
  return asIdentity(db, a, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"atlas-preferences:" + a.id},0))`;
    const old = await tx.userPreference.findUnique({
      where: { actorId: a.id },
    });
    if ((old?.revision ?? 0) !== input.revision)
      throw new AppError("REVISION_CONFLICT", 409);
    const { revision, ...data } = input;
    return tx.userPreference.upsert({
      where: { actorId: a.id },
      create: { actorId: a.id, ...data },
      update: { ...data, revision: revision + 1 },
      select: {
        assignment: true,
        reply: true,
        mention: true,
        revision: true,
        updatedAt: true,
      },
    });
  });
}
