import { randomUUID } from "node:crypto";
import pg from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { SCHEMA_REVISION } from "../release.ts";
import { createRunnerClient, RunnerBusy } from "./runner-client.ts";

type Lease = {
  id: string;
  kind: "python" | "latex";
  source: string | null;
  timeoutMs: number;
};
type Outcome = {
  status: string;
  elapsedMs: number;
  ran: boolean;
  stdout: string;
  stderr: string;
  pdf: Buffer | null;
};
let activeWorker = false;

const abandoned: Outcome = {
  status: "abandoned",
  elapsedMs: 0,
  ran: false,
  stdout: "",
  stderr: "",
  pdf: null,
};

export function createComputeWorker(env: NodeJS.ProcessEnv) {
  if (
    env.ATLAS_COMPUTE_ENABLED !== "1" ||
    env.ATLAS_RESOURCE_LIMITS_ENABLED !== "1" ||
    !env.QUEUE_DATABASE_URL
  ) {
    throw new Error(
      "Compute worker requires the metering profile and queue role",
    );
  }
  const runner = createRunnerClient(env);
  const pool = new pg.Pool({
    connectionString: env.QUEUE_DATABASE_URL,
    options: "-c TimeZone=UTC",
    max: 3,
    connectionTimeoutMillis: 2500,
    statement_timeout: 5000,
  });
  pool.on("error", () =>
    console.error(JSON.stringify({ event: "compute_worker_connection_lost" })),
  );
  let heartbeat = false;
  let lastProbe = Number.NEGATIVE_INFINITY;
  let syncing: Promise<boolean> | undefined;
  let closed = false;
  let currentRun: AbortController | undefined;
  let currentCycle: Promise<boolean> | undefined;

  function refreshHealth(force = false) {
    if (syncing) return syncing;
    if (!force && performance.now() - lastProbe < 4000)
      return Promise.resolve(heartbeat);
    syncing = (async () => {
      lastProbe = performance.now();
      await pool.query("SELECT ops.reap_compute_jobs()");
      const healthy = await runner.healthy();
      if (healthy && !closed) {
        await pool.query(
          `INSERT INTO ops.service_heartbeat(service,revision,"checkedAt") VALUES ('compute',$1,now())
          ON CONFLICT(service) DO UPDATE SET revision=excluded.revision,"checkedAt"=excluded."checkedAt"`,
          [SCHEMA_REVISION],
        );
      }
      if (!healthy || closed) {
        await pool.query(
          `UPDATE ops.service_heartbeat SET "checkedAt"=TIMESTAMPTZ 'epoch' WHERE service='compute' AND revision=$1`,
          [SCHEMA_REVISION],
        );
      }
      heartbeat = healthy && !closed;
      return heartbeat;
    })()
      .catch((error) => {
        heartbeat = false;
        throw error;
      })
      .finally(() => {
        syncing = undefined;
      });
    return syncing;
  }

  async function finish(id: string, lease: string, result: Outcome) {
    await pool.query("SELECT ops.finish_compute_job($1,$2,$3,$4,$5,$6,$7,$8)", [
      id,
      lease,
      result.status,
      result.elapsedMs,
      result.ran,
      result.stdout,
      result.stderr,
      result.pdf,
    ]);
  }

  async function execute(job: Lease, lease: string) {
    if (job.source === null) {
      await finish(job.id, lease, abandoned);
      return;
    }
    const controller = new AbortController();
    currentRun = controller;
    let stopped: "cancel" | "revoked" | "lost" | undefined;
    let checking = false;
    let dispatched = false;
    let started = 0;
    async function check() {
      if (checking || controller.signal.aborted) return;
      checking = true;
      try {
        const {
          rows: [status],
        } = await pool.query<{
          control: "active" | "cancel" | "revoked" | "lost";
        }>("SELECT ops.compute_job_control($1,$2) AS control", [job.id, lease]);
        if (status.control !== "active") {
          stopped = status.control;
          controller.abort();
        }
      } catch {
        controller.abort();
      } finally {
        checking = false;
      }
    }
    await check();
    const timer = setInterval(() => void check(), 250);
    let result = abandoned;
    try {
      if (!controller.signal.aborted && !closed && job.source !== null) {
        // The runner reports BUSY before accepting a job. Only that explicit
        // outcome can be retried without risking a second execution.
        for (let attempt = 0; attempt < 4; attempt++) {
          controller.signal.throwIfAborted();
          started = performance.now();
          dispatched = true;
          try {
            const reply = await runner.run(
              { kind: job.kind, source: job.source, timeoutMs: job.timeoutMs },
              controller.signal,
            );
            result = { ...reply, ran: true };
            break;
          } catch (error) {
            if (!(error instanceof RunnerBusy)) throw error;
            dispatched = false;
            if (attempt < 3)
              await delay(180, undefined, { signal: controller.signal });
          }
        }
      }
    } catch {
      if (stopped && stopped !== "lost") {
        result = {
          ...abandoned,
          status: stopped === "cancel" ? "canceled" : "abandoned",
          ran: dispatched,
          elapsedMs: dispatched
            ? Math.min(job.timeoutMs, Math.ceil(performance.now() - started))
            : 0,
        };
      }
    } finally {
      clearInterval(timer);
      currentRun = undefined;
    }
    await finish(job.id, lease, result);
  }

  function cycle() {
    if (currentCycle) return currentCycle;
    currentCycle = (async () => {
      if (closed || !(await refreshHealth())) return false;
      const lease = randomUUID();
      const {
        rows: [job],
      } = await pool.query<Lease>("SELECT * FROM ops.claim_compute_job($1)", [
        lease,
      ]);
      if (!job) return false;
      await execute(job, lease);
      return true;
    })().finally(() => {
      currentCycle = undefined;
    });
    return currentCycle;
  }

  return {
    cycle,
    refreshHealth,
    async close() {
      closed = true;
      currentRun?.abort();
      await Promise.allSettled([currentCycle, syncing]);
      await pool.end();
    },
  };
}

// One leased job at a time per broker. The runner enforces an independent limit.
export async function runWorker(env: NodeJS.ProcessEnv) {
  if (activeWorker) throw new Error("Compute broker already running");
  activeWorker = true;
  const worker = createComputeWorker(env);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void worker
      .close()
      .catch(() =>
        console.error(
          JSON.stringify({ event: "compute_worker_shutdown_failed" }),
        ),
      );
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const heartbeat = setInterval(
    () =>
      void worker.refreshHealth(true).catch(() => {
        console.error(JSON.stringify({ event: "compute_runner_unavailable" }));
      }),
    5000,
  );
  try {
    while (!stopping) {
      let ran = false;
      try {
        ran = await worker.cycle();
      } catch {
        console.error(JSON.stringify({ event: "compute_worker_cycle_failed" }));
      }
      if (!ran && !stopping)
        await new Promise((resolve) => setTimeout(resolve, 350));
    }
  } finally {
    clearInterval(heartbeat);
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    activeWorker = false;
  }
}
