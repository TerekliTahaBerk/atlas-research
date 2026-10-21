import { PrismaClient } from './generated/client/client';
import { PrismaPg } from '@prisma/adapter-pg';
/** Server-only factory; creating/importing the package does not open a connection. */
export function createDatabase(connectionString: string) {
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  )
    throw new Error('A PostgreSQL connection URL is required.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
export { Prisma } from './generated/client/client';
