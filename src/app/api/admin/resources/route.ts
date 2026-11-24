import {
  adjustAdminResources,
  operatorAction,
  readAdminResources,
} from "@/server/billing/admin";
import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";

export function GET(request: Request) {
  return entry(request, (actor, db) => readAdminResources(db, actor));
}
export function POST(request: Request) {
  return entry(request, async (actor, db) =>
    adjustAdminResources(
      db,
      actor,
      await readMutation(request, operatorAction),
    ),
  );
}
