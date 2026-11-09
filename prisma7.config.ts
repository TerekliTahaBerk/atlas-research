import { defineConfig } from "prisma/config";

// Generation/build is deliberately independent of any live database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? "postgresql://invalid:invalid@127.0.0.1:1/invalid" },
});
