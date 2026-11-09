import { entry } from "@/server/entry";
import { homeActivity } from "@/server/domain/home";
export const GET = (request: Request) =>
  entry(request, (actor, db) => homeActivity(db, actor));
