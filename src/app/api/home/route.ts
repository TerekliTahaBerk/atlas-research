import { dashboardInput, homeDashboard } from "@/server/domain/dashboard";
import { calendarToday } from "@/lib/task-model";
import { entry } from "@/server/entry";
import { homeActivity } from "@/server/domain/home";
export const GET = (request: Request) =>
  entry(request, (actor, db) => {
    const q = new URL(request.url).searchParams;
    return q.get("view") === "personal"
      ? homeDashboard(
          db,
          actor,
          dashboardInput.parse({
            page: q.get("page") ?? 0,
            q: q.get("q") ?? "",
            workspace: q.get("workspace") ?? "all",
            kind: q.get("kind") ?? "all",
            sort: q.get("sort") ?? "updated",
            status: q.get("status") ?? "active",
            today: q.get("today") ?? calendarToday(),
          }),
        )
      : homeActivity(db, actor);
  });
