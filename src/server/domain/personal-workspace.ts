import { randomUUID } from "node:crypto";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";

export function ensurePersonalWorkspace(db: Database, identity: Identity) {
  return asIdentity(db, identity, async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id},0))`;
    const existing = await tx.workspace.findUnique({ where: { personalOwnerId: identity.id } });
    if (existing) return existing;
    const id = randomUUID();
    // No RETURNING before the first member exists: RLS already protects private reads.
    await tx.workspace.createMany({ data: [{ id, kind: "personal", name: "Personal workspace", personalOwnerId: identity.id, createdBy: identity.id }] });
    await tx.workspaceMember.createMany({ data: [{ workspaceId: id, userId: identity.id, role: "owner" }] });
    return tx.workspace.findUniqueOrThrow({ where: { id } });
  });
}
