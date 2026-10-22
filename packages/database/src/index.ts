import { PrismaClient } from './generated/client/client';
import { PrismaPg } from '@prisma/adapter-pg';
/** Server-only factory; creating/importing the package does not open a connection. */
export function createDatabase(connectionString: string) {
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  )
    throw new Error('A PostgreSQL connection URL is required.');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }),
    // Hosted TLS/pool acquisition can exceed Prisma's two-second default.
    // Keep the same bounded budget for anonymous rate limits and actor work.
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });
}
export { Prisma } from './generated/client/client';
