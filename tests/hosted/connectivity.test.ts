import { it, expect } from 'vitest';
import { z } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import { checkRuntime } from '../../apps/web/src/features/platform/server/database';

// Explicitly opt in to the exact development project approved in this task.
// These checks never create users, send mail, migrate or mutate domain data.
const project = 'hgngonpirctrwbckhbmy';
if (process.env.ATLAS_APPROVED_DEV_PROJECT !== project)
  throw new Error(
    'Explicit approval of the Atlas development project is required.',
  );
const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const connection = process.env.DATABASE_URL;
if (origin !== `https://${project}.supabase.co` || !key || !connection)
  throw new Error('Expected Atlas development runtime configuration.');
const url = new URL(connection);
if (
  url.hostname !== 'aws-0-ap-northeast-2.pooler.supabase.com' ||
  url.username !== `atlas_app_dev.${project}` ||
  url.pathname !== '/postgres' ||
  url.searchParams.get('sslmode') !== 'verify-full'
)
  throw new Error(
    'Expected the approved unprivileged Atlas runtime with verified TLS.',
  );

it.each([5432, 6543])(
  'Prisma verifies TLS, runtime privileges and actor cleanup on hosted pooler %s',
  async (port) => {
    const target = new URL(connection);
    target.port = String(port);
    const db = createDatabase(target.toString());
    try {
      for (const id of [
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
      ]) {
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          await checkRuntime(tx);
          await tx.$queryRaw`SELECT set_config('atlas.actor_id',${id},true)`;
          expect(
            await tx.$queryRaw`SELECT atlas_private.actor()=${id}::uuid AS correct`,
          ).toEqual([{ correct: true }]);
          expect(
            await tx.$queryRaw`SELECT has_table_privilege(current_user,'public.projects','UPDATE') AS raw_write,has_function_privilege(current_user,'atlas_private.mutate_core(text,jsonb,uuid)','EXECUTE') AS internal_execute`,
          ).toEqual([{ raw_write: false, internal_execute: false }]);
        });
        expect(
          await db.$queryRaw`SELECT atlas_private.actor() IS NULL AS clean`,
        ).toEqual([{ clean: true }]);
        expect(
          await db.project.findMany({ select: { id: true }, take: 1 }),
        ).toEqual([]);
      }
    } finally {
      await db.$disconnect();
    }
  },
);

it('actual hosted Auth requires email confirmation and Data API excludes domain/private access', async () => {
  const settings = await fetch(`${origin}/auth/v1/settings`, {
    headers: { apikey: key },
    cache: 'no-store',
  });
  expect(settings.status).toBe(200);
  expect(
    z
      .object({
        external: z.object({ email: z.boolean() }),
        mailer_autoconfirm: z.boolean(),
      })
      .parse(await settings.json()),
  ).toMatchObject({ external: { email: true }, mailer_autoconfirm: false });
  const domain = await fetch(`${origin}/rest/v1/projects?select=id&limit=1`, {
    headers: { apikey: key },
    cache: 'no-store',
  });
  expect([401, 403]).toContain(domain.status);
  const privateSchema = await fetch(
    `${origin}/rest/v1/projects?select=id&limit=1`,
    {
      headers: { apikey: key, 'Accept-Profile': 'atlas_private' },
      cache: 'no-store',
    },
  );
  expect(privateSchema.status).toBe(406);
  expect(
    z.object({ code: z.string() }).parse(await privateSchema.json()).code,
  ).toBe('PGRST106');
});
