import 'server-only';
import { createDatabase, Prisma } from '@atlas/database';
import { z } from 'zod';
import { PlatformError } from './errors';
export interface VerifiedActor {
  id: string;
  email: string;
}
let database: ReturnType<typeof createDatabase> | undefined;
export function runtimeDatabase() {
  if (!process.env.DATABASE_URL || process.env.ATLAS_MODE !== 'live')
    throw new PlatformError(
      'INTERNAL_ERROR',
      'Atlas live services are not configured.',
    );
  database ??= createDatabase(process.env.DATABASE_URL);
  return database;
}
export async function checkRuntime(tx: Prisma.TransactionClient) {
  const rows =
    await tx.$queryRaw<unknown>`SELECT EXISTS(SELECT 1 FROM pg_roles privileged WHERE pg_has_role(current_user,privileged.oid,'MEMBER') AND (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolreplication)) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS unsafe, pg_has_role(current_user,'atlas_runtime','MEMBER') AS permitted`;
  const [row] = z
    .array(z.object({ unsafe: z.boolean(), permitted: z.boolean() }))
    .parse(rows);
  if (!row || row.unsafe || !row.permitted)
    throw new PlatformError(
      'INTERNAL_ERROR',
      'The database runtime role is not safe for application requests.',
    );
}
export async function withActor<T>(
  actor: VerifiedActor,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const verified = z.object({ id: z.uuid(), email: z.email() }).parse(actor);
  return runtimeDatabase().$transaction(
    async (tx) => {
      await checkRuntime(tx);
      await tx.$queryRaw`SELECT set_config('atlas.actor_id',${verified.id},true),set_config('atlas.actor_email',${verified.email.toLowerCase()},true)`;
      return work(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
