import { z } from "zod";

export const MAX_RESULT_BYTES = 4_194_304;
const responseLimit = 6_100_000;
const runnerResult = z
  .object({
    status: z.enum(["succeeded", "failed", "timed_out", "output_limit"]),
    elapsedMs: z.number().int().min(0).max(905_000),
    stdout: z.string(),
    stderr: z.string(),
    pdfBase64: z
      .string()
      .max(Math.ceil(MAX_RESULT_BYTES / 3) * 4)
      .optional(),
  })
  .strict();

export class RunnerBusy extends Error {}

export type RunnerResult = {
  status: z.output<typeof runnerResult>["status"];
  elapsedMs: number;
  stdout: string;
  stderr: string;
  pdf: Buffer | null;
};

export function runnerConnection(env: NodeJS.ProcessEnv) {
  const token = env.ATLAS_COMPUTE_RUNNER_TOKEN;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid compute runner token");
  const endpoint = new URL(
    env.ATLAS_COMPUTE_RUNNER_URL || "http://compute-runner:8090",
  );
  const host = endpoint.hostname;
  const service =
    host === "compute-runner" &&
    endpoint.protocol === "http:" &&
    endpoint.port === "8090";
  const test =
    env.NODE_ENV !== "production" &&
    host === "127.0.0.1" &&
    endpoint.protocol === "http:" &&
    endpoint.port;
  if (
    !(service || test) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  )
    throw new Error("Invalid compute runner endpoint");
  return {
    health: new URL("/healthz", endpoint),
    run: new URL("/v1/run", endpoint),
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function limitedJson(
  response: Response,
  maximum: number,
): Promise<unknown> {
  if (!response.body) throw new Error("Missing runner body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("Runner body is too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function text(value: string) {
  const clean = value.replaceAll("\0", "");
  const bytes = Buffer.from(clean, "utf8");
  return bytes.length <= 32768
    ? clean
    : bytes.subarray(0, 32765).toString("utf8");
}

export function createRunnerClient(env: NodeJS.ProcessEnv) {
  const settings = runnerConnection(env);
  return {
    async healthy() {
      try {
        const response = await fetch(settings.health, {
          headers: settings.headers,
          signal: AbortSignal.timeout(2500),
          redirect: "error",
        });
        if (!response.ok) {
          await response.body?.cancel();
          return false;
        }
        const data = z
          .object({ version: z.string().min(1).max(80) })
          .safeParse(await limitedJson(response, 512));
        return data.success;
      } catch {
        return false;
      }
    },
    async run(
      input: { kind: "python" | "latex"; source: string; timeoutMs: number },
      signal: AbortSignal,
    ): Promise<RunnerResult> {
      const response = await fetch(settings.run, {
        method: "POST",
        headers: { ...settings.headers, "Content-Type": "application/json" },
        redirect: "error",
        body: JSON.stringify(input),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(input.timeoutMs + 10_000),
        ]),
      });
      if (!response.ok) {
        if (response.status === 503) {
          const info = z
            .object({ error: z.string() })
            .safeParse(await limitedJson(response, 512));
          if (info.success && info.data.error === "RUNNER_BUSY")
            throw new RunnerBusy();
        } else {
          await response.body?.cancel();
        }
        throw new Error("Compute runner rejected the job");
      }
      const parsed = runnerResult.parse(
        await limitedJson(response, responseLimit),
      );
      const pdf = parsed.pdfBase64
        ? Buffer.from(parsed.pdfBase64, "base64")
        : null;
      if (
        pdf &&
        (input.kind !== "latex" ||
          parsed.status !== "succeeded" ||
          pdf.length > MAX_RESULT_BYTES ||
          pdf.subarray(0, 5).toString("ascii") !== "%PDF-" ||
          pdf.toString("base64") !== parsed.pdfBase64)
      )
        throw new Error("Invalid runner PDF");
      return {
        status: parsed.status,
        elapsedMs: Math.min(input.timeoutMs, parsed.elapsedMs),
        stdout: text(parsed.stdout),
        stderr: text(parsed.stderr),
        pdf,
      };
    },
  };
}
