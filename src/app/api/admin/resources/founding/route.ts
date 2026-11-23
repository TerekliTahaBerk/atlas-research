import { foundingReview, foundingReviewInput } from "@/server/billing/founding";
import { getMailQueue } from "@/server/auth";
import { entry } from "@/server/entry";
import { getEnv } from "@/server/env";
import { readMutation } from "@/server/http";

export function POST(request: Request) {
  return entry(request, async (actor, db) =>
    foundingReview(
      db,
      actor,
      await readMutation(request, foundingReviewInput),
      getEnv().APP_ORIGIN,
      getMailQueue(),
    ),
  );
}
