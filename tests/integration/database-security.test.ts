import { afterAll, expect, it } from 'vitest';
import { createDatabase } from '../../packages/database/src/index';
const url = process.env.ATLAS_TEST_ADMIN_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.startsWith('/atlas_p01_test')
)
  throw new Error('Disposable local Atlas test database required.');
const admin = createDatabase(url);
afterAll(() => admin.$disconnect());
it('denies every effective browser privilege on migration history, including non-RLS privileges', async () => {
  expect(
    await admin.$queryRaw`SELECT rolname, p FROM pg_roles CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p WHERE rolname IN ('anon','authenticated') AND has_table_privilege(rolname,'public._prisma_migrations',p)`,
  ).toEqual([]);
  expect(
    await admin.$queryRaw`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public._prisma_migrations'::regclass`,
  ).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }]);
  expect(
    await admin.$queryRaw`SELECT policyname::text FROM pg_policies WHERE schemaname='public' AND tablename='_prisma_migrations'`,
  ).toEqual([]);
  for (const role of ['anon', 'authenticated'])
    for (const sql of [
      'SELECT id FROM public._prisma_migrations LIMIT 0',
      'INSERT INTO public._prisma_migrations(id) VALUES (null)',
      'UPDATE public._prisma_migrations SET logs=logs WHERE false',
      'DELETE FROM public._prisma_migrations WHERE false',
      'TRUNCATE public._prisma_migrations',
    ]) {
      await expect(
        admin.$transaction(async (tx) => {
          if (role === 'anon') await tx.$executeRaw`SET LOCAL ROLE anon`;
          else await tx.$executeRaw`SET LOCAL ROLE authenticated`;
          await tx.$queryRawUnsafe(sql); // fixed test strings, no external SQL
        }),
      ).rejects.toThrow(/permission denied/);
    }
});
it('owner can still migrate and future Prisma-created tables/sequences have no browser grants', async () => {
  const rollback = new Error('rollback probe');
  await expect(
    admin.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE public._prisma_migrations SET logs=logs WHERE false`;
      await tx.$executeRaw`CREATE TABLE public.atlas_default_grant_probe(id bigint GENERATED ALWAYS AS IDENTITY)`;
      expect(
        await tx.$queryRaw`SELECT rolname,p FROM pg_roles CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p WHERE rolname IN ('anon','authenticated') AND has_table_privilege(rolname,'public.atlas_default_grant_probe',p)`,
      ).toEqual([]);
      expect(
        await tx.$queryRaw`SELECT rolname,p FROM pg_roles CROSS JOIN unnest(ARRAY['SELECT','UPDATE','USAGE']) p WHERE rolname IN ('anon','authenticated') AND has_sequence_privilege(rolname,'public.atlas_default_grant_probe_id_seq',p)`,
      ).toEqual([]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
