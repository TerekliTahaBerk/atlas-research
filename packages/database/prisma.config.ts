import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
config({ path: '../../.env', quiet: true });
const connection = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
// Validation and generation work offline. Migration commands must have an explicit target.
if (process.argv.includes('migrate') && !connection)
  throw new Error(
    'Set DIRECT_URL to an isolated development database before migrating.',
  );
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: connection ?? 'postgresql://offline:offline@127.0.0.1:1/atlas_offline',
  },
});
