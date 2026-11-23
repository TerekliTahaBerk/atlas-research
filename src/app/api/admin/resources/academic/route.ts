import { academicReviewInput, reviewAcademic } from "@/server/billing/academic";
import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";

export function POST(request: Request) {
  return entry(request, async (actor, db) =>
    reviewAcademic(db, actor, await readMutation(request, academicReviewInput)),
  );
}
