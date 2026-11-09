import { spawnSync } from "node:child_process";
import { provisionInitialUser } from "./provision-initial-user.mjs";

const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit" },
);
if (migration.status !== 0) process.exitCode = migration.status ?? 1;
else {
  try {
    console.log(
      JSON.stringify({
        event: "initial_identity",
        result: await provisionInitialUser(),
      }),
    );
  } catch {
    console.error(
      "Initial identity provisioning failed; no personal data or credential logged.",
    );
    process.exitCode = 1;
  }
}
