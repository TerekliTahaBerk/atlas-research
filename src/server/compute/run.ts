import { runWorker } from "./worker.ts";

await runWorker(process.env).catch(() => {
  console.error(JSON.stringify({ event: "compute_worker_start_failed" }));
  process.exitCode = 1;
});
