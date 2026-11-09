import "server-only";
import { getEnv } from "../env";
import { createDatabase } from "../db/client";
import { createAuth } from "./create-auth";

const globalAuth = globalThis as unknown as { atlasAuth?: ReturnType<typeof createAuth> };
export function getAuth() {
  if (!globalAuth.atlasAuth) {
    const env = getEnv();
    globalAuth.atlasAuth = createAuth(createDatabase(env.AUTH_DATABASE_URL), env);
  }
  return globalAuth.atlasAuth;
}
