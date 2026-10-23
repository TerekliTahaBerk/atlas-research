import 'server-only';
import { createDatabase, type Prisma } from '@atlas/database';
import { z } from 'zod';
import { PlatformError } from '@/features/platform/server/errors';
let database: ReturnType<typeof createDatabase> | undefined;
/** Worker login is separate from atlas_runtime; no table grants, ownership or BYPASSRLS. */
export async function withAIWorker<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  actorId?: string,
) {
  if (!process.env.ATLAS_AI_WORKER_DATABASE_URL)
    throw new PlatformError(
      'CONFLICT',
      'The isolated extraction worker is not configured.',
    );
  database ??= createDatabase(process.env.ATLAS_AI_WORKER_DATABASE_URL);
  return database.$transaction(
    async (tx) => {
      const [role] = z
        .array(z.object({ safe: z.boolean() }))
        .parse(
          await tx.$queryRaw`SELECT pg_has_role(current_user,'atlas_ai_worker','MEMBER') AND NOT pg_has_role(current_user,'atlas_runtime','MEMBER') AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER') AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS safe`,
        );
      if (!role?.safe)
        throw new PlatformError(
          'INTERNAL_ERROR',
          'The AI worker database role is unsafe.',
        );
      if (actorId)
        await tx.$queryRaw`SELECT set_config('atlas.actor_id',${z.uuid().parse(actorId)},true)`;
      return work(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
