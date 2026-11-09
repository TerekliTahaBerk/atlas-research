import { getWorkerEnv } from "../env.js";
import { createMailQueue } from "./outbox.js";

const queue = createMailQueue(getWorkerEnv());
const heartbeat=setInterval(()=>void queue.heartbeat().catch(()=>console.error(JSON.stringify({event:"mail_heartbeat_unavailable"}))),5000);
await queue.heartbeat();
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
while (!stopping) {
  try { await queue.flush(20,()=>stopping); }
  catch { console.error(JSON.stringify({ event: "mail_worker_unavailable" })); }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
clearInterval(heartbeat);
await queue.close();
