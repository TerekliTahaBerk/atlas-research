import { processSandboxEvent } from "@/server/billing/sandbox-provider";
import { entry } from "@/server/entry";
import { readLimitedBody } from "@/server/body";
import { AppError } from "@/server/errors";

export function POST(request: Request) {
  return entry(request, async (actor, db) => {
    const secret = process.env.ATLAS_BILLING_SANDBOX_SECRET;
    if (!secret || process.env.NODE_ENV === "production")
      throw new AppError("BILLING_DISABLED", 503);
    const raw = await readLimitedBody(request, 10_000);
    return processSandboxEvent(
      db,
      actor,
      raw,
      request.headers.get("atlas-signature"),
      secret,
    );
  });
}
