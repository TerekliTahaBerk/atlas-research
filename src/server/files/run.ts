import { createFileWorker } from "./worker.js";
import { assertProductionEnvIsolation } from "../env.js";
assertProductionEnvIsolation(process.env, "mail");
if (
  !process.env.FILE_STORAGE_PATH ||
  !process.env.DATABASE_URL ||
  !process.env.QUEUE_DATABASE_URL
)
  throw new Error("File worker configuration required");
const worker = createFileWorker(process.env);
let stop = false,
  lastCleanup = 0;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
try {
  while (!stop) {
    try {
      await worker.heartbeat();
      await worker.flush();
      if (Date.now() - lastCleanup > 600000) {
        await worker.cleanup();
        lastCleanup = Date.now();
      }
    } catch {
      console.error(JSON.stringify({ event: "file_worker_retry" }));
    }
    if (!stop) await new Promise((r) => setTimeout(r, 2000));
  }
} finally {
  await worker.close();
}
