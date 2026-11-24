import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readFile, readdir, rm, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_LIMIT = 32 * 1024;
const TEXT_LIMIT = 32 * 1024;
const PDF_LIMIT = 4 * 1024 * 1024;
const BODY_LIMIT = 6 * SOURCE_LIMIT + 128;
const PORT = 8090;
const tmpRoot = "/tmp";
const launcher = fileURLToPath(new URL("./isolate", import.meta.url));
const release = process.env.ATLAS_COMPUTE_RUNNER_VERSION ?? "local";
const token = process.env.ATLAS_COMPUTE_RUNNER_TOKEN;

class RunnerProblem extends Error {
  constructor(code, status) {
    super(code);
    this.status = status;
  }
}

function authorized(header) {
  if (typeof header !== "string" || header.length !== 7 + token.length)
    return false;
  const supplied = Buffer.from(header);
  const expected = Buffer.from("Bearer " + token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function send(res, status, value) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(k => !["kind", "source", "timeoutMs"].includes(k)) ||
    !["python", "latex"].includes(body.kind) || typeof body.source !== "string" ||
    !body.source.trim() || Buffer.byteLength(body.source) > SOURCE_LIMIT ||
    !Number.isInteger(body.timeoutMs) || body.timeoutMs < 1 ||
    body.timeoutMs > (body.kind === "latex" ? 30_000 : 900_000))
    throw new RunnerProblem("INVALID_REQUEST", 400);
  return body;
}

async function readJob(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new RunnerProblem("INVALID_REQUEST", 415);
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > BODY_LIMIT) {
    req.resume();
    throw new RunnerProblem("REQUEST_TOO_LARGE", 413);
  }
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > BODY_LIMIT) throw new RunnerProblem("REQUEST_TOO_LARGE", 413);
    parts.push(part);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(parts, size).toString("utf8")); }
  catch { throw new RunnerProblem("INVALID_REQUEST", 400); }
  return validate(body);
}

async function assertContainerLimits() {
  if (process.platform !== "linux" || process.getuid?.() === 0)
    throw new Error("linux unprivileged runner required");
  const limit = (name) => readFile("/sys/fs/cgroup/" + name, "utf8").then(v => v.trim());
  const [memory, pids, cpu] = await Promise.all([
    limit("memory.max"), limit("pids.max"), limit("cpu.max"),
  ]);
  const [quota, interval] = cpu.split(/\s+/).map(Number);
  if (!(Number(memory) > 0 && Number(memory) <= 512 * 1024 * 1024) ||
    !(Number(pids) > 0 && Number(pids) <= 64) ||
    !(quota > 0 && interval > 0 && quota / interval <= 2))
    throw new Error("runner cgroup limits unavailable");
  const mounts = await readFile("/proc/self/mountinfo", "utf8");
  const mountRows = mounts.split("\n");
  const processRoot = mountRows.find(line => line.split(" ")[4] === "/");
  if (!processRoot?.split(" ")[5].split(",").includes("ro"))
    throw new Error("read-only container root required");
  const tmp = mountRows.find(line => line.split(" ")[4] === tmpRoot);
  const flags = tmp?.split(" ")[5].split(",") ?? [];
  const volume = await statfs(tmpRoot);
  if (!tmp?.includes(" - tmpfs ") || !["noexec", "nosuid", "nodev"].every(flag => flags.includes(flag)) ||
    volume.bsize * volume.blocks > 64 * 1024 * 1024)
    throw new Error("size-limited private tmpfs required");
}

async function readPdf(work) {
  let file;
  try {
    file = await open(join(work, "main.pdf"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 12 || stat.size > PDF_LIMIT)
      return null;
    const bytes = await file.readFile();
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !bytes.subarray(-512).includes(Buffer.from("%%EOF"))) return null;
    return bytes.toString("base64");
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => {});
  }
}

function boundedText(bytes) {
  const decoded = bytes.toString("utf8");
  const encoded = Buffer.from(decoded);
  if (encoded.length <= TEXT_LIMIT) return decoded;
  return new TextDecoder().decode(encoded.subarray(0, TEXT_LIMIT), { stream: true });
}

function supervised(job, source, work, signal) {
  if (signal.aborted) throw new RunnerProblem("CLIENT_GONE", 503);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(launcher, [
      job.kind,
      source,
      work,
      dirname(source) + ":",
      String(Math.ceil(job.timeoutMs / 1000)),
    ], {
      cwd: work,
      env: {},
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    });
    let reason, forceRecovery, setup = "", failed = false;
    const output = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    function stop(next) {
      if (reason) return;
      reason = next;
      child.kill("SIGKILL");
      // Never free runner admission if the kernel has not reaped the workload.
      // The surrounding container runtime then retires this PID namespace.
      forceRecovery = setTimeout(() => process.exit(1), 2500);
    }
    function append(channel, part) {
      const remaining = TEXT_LIMIT - output[channel].length;
      output[channel] = Buffer.concat([output[channel], part.subarray(0, remaining)]);
      if (part.length > remaining) stop("output_limit");
    }
    const deadline = setTimeout(() => stop("timed_out"), job.timeoutMs);
    const cancel = () => stop("aborted");
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    child.stdout.on("data", part => append("stdout", part));
    child.stderr.on("data", part => append("stderr", part));
    child.stdio[3].on("data", part => {
      setup = (setup + part.toString("ascii")).slice(0, 24);
    });
    child.on("error", () => { failed = true; });
    child.on("close", (exitCode, exitSignal) => {
      clearTimeout(deadline);
      clearTimeout(forceRecovery);
      signal.removeEventListener("abort", cancel);
      const setupFailure = setup.match(/^S?E(\d+)$/);
      if (reason === "aborted")
        return reject(new RunnerProblem("CLIENT_GONE", 503));
      if (failed || setup !== "S") {
        if (setupFailure) console.error(JSON.stringify({ event: "runner_isolation_failed", stage: Number(setupFailure[1]) }));
        return reject(new RunnerProblem("ISOLATION_UNAVAILABLE", 503));
      }
      const runtimeStatus = exitSignal === "SIGXCPU" ? "timed_out"
        : exitSignal === "SIGXFSZ" ? "output_limit"
        : exitCode === 0 ? "succeeded" : "failed";
      resolve({
        status: reason ?? runtimeStatus,
        elapsedMs: Math.min(job.timeoutMs, Math.max(1, Math.ceil(performance.now() - started))),
        stdout: boundedText(output.stdout),
        stderr: boundedText(output.stderr),
      });
    });
  });
}

async function restoreDirectoryAccess(directory) {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await restoreDirectoryAccess(join(directory, entry.name));
  }
}

async function removeScratch(folder) {
  try {
    await rm(folder, { recursive: true, force: true });
  } catch {
    try {
      // The child can create restrictive scratch directories, but is fully
      // reaped here. Only private directories are reopened, never symlinks.
      await restoreDirectoryAccess(folder);
      await rm(folder, { recursive: true, force: true });
    } catch {
      console.error(JSON.stringify({ event: "runner_cleanup_failed" }));
      process.exit(1);
    }
  }
}

async function execute(job, signal) {
  const folder = await mkdtemp(join(tmpRoot, "atlas-compute-"));
  const work = join(folder, "workspace");
  const source = join(folder, job.kind === "latex" ? "main.tex" : "main.py");
  try {
    await mkdir(work, { mode: 0o700 });
    await writeFile(source, job.source, { mode: 0o400, flag: "wx" });
    const result = await supervised(job, source, work, signal);
    if (result.status === "succeeded" && job.kind === "latex") {
      const pdfBase64 = await readPdf(work);
      if (pdfBase64) return { ...result, pdfBase64 };
      return { ...result, status: "failed" };
    }
    return result;
  } finally {
    await removeScratch(folder);
  }
}

async function boot() {
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token) || !/^[a-zA-Z0-9._-]{1,64}$/.test(release))
    throw new Error("runner configuration unavailable");
  if (process.argv[2] === "--health") {
    const response = await fetch("http://127.0.0.1:" + PORT + "/healthz", {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("runner health unavailable");
    return;
  }
  await assertContainerLimits();
  const fingerprint = (await readFile(new URL("./image.fingerprint", import.meta.url), "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("runner fingerprint unavailable");
  const version = release + "." + fingerprint.slice(0, 24);
  const signal = AbortSignal.timeout(8000);
  const python = await execute({
    kind: "python", timeoutMs: 3000,
    source: "from statistics import mean\nprint('atlas-probe', mean([1, 2, 3]))",
  }, signal);
  const latex = await execute({
    kind: "latex", timeoutMs: 5000,
    source: "\\documentclass{article}\n\\begin{document}Atlas compute probe\\end{document}",
  }, signal);
  if (python.status !== "succeeded" || python.stdout.trim() !== "atlas-probe 2" ||
    latex.status !== "succeeded" || !latex.pdfBase64)
    throw new Error("isolation qualification failed");

  let active, closing = false;
  const server = createServer(async (req, res) => {
    if (!authorized(req.headers.authorization)) {
      req.resume();
      return send(res, 404, { error: "UNAVAILABLE" });
    }
    if (req.url === "/healthz" && req.method === "GET")
      return send(res, closing ? 503 : 200, closing ? { error: "UNAVAILABLE" } : { version });
    if (req.url !== "/v1/run" || req.method !== "POST") {
      req.resume();
      return send(res, 404, { error: "UNAVAILABLE" });
    }
    if (closing || active) {
      req.resume();
      return send(res, 503, { error: "RUNNER_BUSY" });
    }
    const controller = new AbortController();
    active = controller;
    res.once("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      const job = await readJob(req);
      const result = await execute(job, controller.signal);
      send(res, 200, result);
    } catch (problem) {
      if (problem instanceof RunnerProblem)
        send(res, problem.status, { error: problem.message });
      else
        send(res, 503, { error: "RUNNER_UNAVAILABLE" });
    } finally {
      active = undefined;
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 8000;
  server.keepAliveTimeout = 2000;
  server.maxHeadersCount = 32;
  server.maxConnections = 16;
  server.listen(PORT, "0.0.0.0");
  const stop = () => {
    closing = true;
    active?.abort();
    server.close();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

boot().catch(error => {
  console.error(JSON.stringify({ event: "runner_unavailable", reason:
    error instanceof RunnerProblem ? error.message : "STARTUP_REQUIREMENTS" }));
  process.exitCode = 1;
});
