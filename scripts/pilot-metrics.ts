import { readFileSync } from "node:fs";
import { summarizePilot } from "../src/lib/pilot-metrics";
try {
  if (process.argv.length !== 3) throw new Error();
  console.log(
    JSON.stringify(
      summarizePilot(JSON.parse(readFileSync(process.argv[2], "utf8"))),
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Invalid aggregate measurement file. Use the versioned template; unknown fields, raw content and inconsistent counts are rejected.",
  );
  process.exitCode = 1;
}
