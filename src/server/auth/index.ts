import "server-only";
import { getEnv } from "../env";
import { createDatabase } from "../db/client";
import { createAuth } from "./create-auth";
import { createMailQueue } from "../mail/outbox";

const globalAuth = globalThis as unknown as { atlasAuth?: ReturnType<typeof createAuth>; atlasIdentityDb?: ReturnType<typeof createDatabase>; atlasMail?: ReturnType<typeof createMailQueue> };
export function getIdentityDatabase() {
  return globalAuth.atlasIdentityDb ??= createDatabase(getEnv().AUTH_DATABASE_URL);
}
export function getMailQueue() {
  return globalAuth.atlasMail ??= createMailQueue(getEnv());
}
export function getAuth() {
  if (!globalAuth.atlasAuth) {
    const env = getEnv();
    globalAuth.atlasAuth = createAuth(getIdentityDatabase(), env, getMailQueue());
  }
  return globalAuth.atlasAuth;
}
