import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import { visitInput, visitWork } from "@/server/domain/dashboard";
export const POST = (request: Request) =>
  entry(request, async (actor, db) =>
    visitWork(db, actor, await readMutation(request, visitInput)),
  );
