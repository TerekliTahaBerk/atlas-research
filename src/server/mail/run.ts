import { getEnv } from "../env.js";
import { createMailQueue } from "./outbox.js";

const queue = createMailQueue(getEnv());
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
while (!stopping) {
  try { await queue.flush(); }
  catch { console.error(JSON.stringify({ event: "mail_worker_unavailable" })); }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
await queue.close();
