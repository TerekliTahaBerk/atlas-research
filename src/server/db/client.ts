import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export function createDatabase(url: string) {
  const adapter = new PrismaPg({ connectionString: url, max: 5, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter, log: [] });
}

export type Database = ReturnType<typeof createDatabase>;
