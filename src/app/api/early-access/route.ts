import { getIdentityDatabase } from "@/server/auth";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { errorResponse } from "@/server/errors";
import { privateJson, readMutation } from "@/server/http";
import { chargeMutation } from "@/server/rate-limit";
import {
  foundingApplicationInput,
  submitFoundingApplication,
} from "@/server/billing/founding";

export async function POST(request: Request) {
  try {
    const data = await readMutation(request, foundingApplicationInput, 5_000);
    // Keep address-specific throttling opaque and cap the unauthenticated surface globally.
    await chargeMutation(getIdentityDatabase(), "founding:intake");
    await chargeMutation(
      getIdentityDatabase(),
      "founding:address:" + data.email,
    );
    await submitFoundingApplication(getRuntimeDatabase(), data);
    return privateJson({ received: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
