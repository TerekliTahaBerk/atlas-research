import "server-only";
import { getEnv } from "../env";
import { createDatabase } from "./client";
const state = globalThis as unknown as { atlasRuntimeDb?: ReturnType<typeof createDatabase> };
export const getRuntimeDatabase = () => state.atlasRuntimeDb ??= createDatabase(getEnv().DATABASE_URL);
