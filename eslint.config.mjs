import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals, ...nextTs,
  globalIgnores([".next/**", "src/generated/**", "docs/design/reference/**", "next-env.d.ts"]),
  { files: ["src/components/**/*.tsx", "src/lib/**/*.ts"], rules: {
    "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/**"], message: "Client components use server entry points, not database/domain imports." }] }],
  } },
]);
