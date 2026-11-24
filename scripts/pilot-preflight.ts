import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Target = { origin: string; release: string; schema: string };

export function parsePilotTarget(args: string[]): Target {
  if (args.length !== 3)
    throw new Error("Expected an origin, release and schema");
  const [value, release, schema] = args;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    ![url.origin, `${url.origin}/`].includes(value) ||
    !/^[a-f0-9]{40}$/.test(release) ||
    !/^\d{12}_[a-z0-9_]+$/.test(schema)
  )
    throw new Error("Invalid HTTPS origin, full release SHA or schema");
  return { origin: url.origin, release, schema };
}

function cacheControl(response: Response, directive: string) {
  return response.headers
    .get("cache-control")
    ?.split(",")
    .some((value) => value.trim().toLowerCase() === directive);
}

async function bodyText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 1024 * 1024)
        throw new Error("Response size exceeds probe ceiling");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

export async function checkPilotPublicRelease(target: Target, request = fetch) {
  const get = (path: string) =>
    request(new URL(path, target.origin), {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  async function json(
    path: string,
    status: number,
    expected: Record<string, string>,
  ) {
    const response = await get(path);
    const body = JSON.parse(await bodyText(response)) as Record<
      string,
      unknown
    >;
    return (
      response.status === status &&
      !!cacheControl(response, "no-store") &&
      Object.entries(expected).every(([key, value]) => body?.[key] === value)
    );
  }
  async function signInNonce() {
    const response = await get("/sign-in");
    const html = await bodyText(response);
    const headers = response.headers;
    const csp = headers.get("content-security-policy") ?? "";
    const directives = csp.split(";").map((value) => value.trim());
    const scripts =
      directives.find((value) => value.startsWith("script-src ")) ?? "";
    const nonce = /'nonce-([\w+/=\-]+)'/.exec(scripts)?.[1];
    if (
      response.status !== 200 ||
      !nonce ||
      !html.includes(`nonce="${nonce}"`) ||
      !/\bmax-age=[1-9]\d*/i.test(
        headers.get("strict-transport-security") ?? "",
      ) ||
      !directives.includes("frame-ancestors 'none'") ||
      headers.get("x-content-type-options")?.toLowerCase() !== "nosniff" ||
      headers.get("referrer-policy") !== "no-referrer"
    )
      return null;
    return nonce;
  }
  const computeScope = new URLSearchParams({
    workspaceId: "00000000-0000-4000-8000-000000000001",
    projectId: "00000000-0000-4000-8000-000000000002",
  });
  const checks: [string, () => Promise<boolean>][] = [
    ["liveness", () => json("/health/live", 200, { status: "ok" })],
    [
      "expected_release_and_schema",
      () =>
        json("/health/ready", 200, {
          status: "ready",
          release: target.release,
          schema: target.schema,
        }),
    ],
    [
      "email_delivery_disabled",
      () => json("/api/capabilities", 200, { emailDelivery: "disabled" }),
    ],
    [
      "anonymous_account_denied",
      () => json("/api/me", 401, { error: "UNAUTHENTICATED" }),
    ],
    [
      "anonymous_compute_denied",
      () =>
        json(`/api/compute?${computeScope}`, 401, { error: "UNAUTHENTICATED" }),
    ],
    [
      "checkout_closed_on_pricing",
      async () => {
        const response = await get("/pricing");
        const html = await bodyText(response);
        return (
          response.status === 200 &&
          html.includes("Checkout and custom automations are unavailable here.")
        );
      },
    ],
    [
      "sign_in_headers_and_fresh_nonce",
      async () => {
        const first = await signInNonce();
        const second = await signInNonce();
        return !!(first && second && first !== second);
      },
    ],
  ];
  const results = await Promise.all(
    checks.map(async ([check, run]) => {
      try {
        return { check, result: (await run()) ? "PASS" : "FAIL" };
      } catch {
        return { check, result: "FAIL" };
      }
    }),
  );
  return {
    scope:
      "Public HTTPS only. Authenticated, provider and recovery acceptance are separate.",
    checkedAt: new Date().toISOString(),
    ...target,
    result: results.every((check) => check.result === "PASS") ? "PASS" : "FAIL",
    checks: results,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const report = await checkPilotPublicRelease(
      parsePilotTarget(process.argv.slice(2)),
    );
    console.log(JSON.stringify(report, null, 2));
    if (report.result === "FAIL") process.exitCode = 1;
  } catch {
    console.error(
      "Usage: npm run pilot:preflight -- https://atlas.example FULL_RELEASE_SHA SCHEMA_REVISION",
    );
    process.exitCode = 1;
  }
}
