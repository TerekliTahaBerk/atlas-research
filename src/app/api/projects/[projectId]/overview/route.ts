import { entry, uuid } from "@/server/entry";
import { projectOverview } from "@/server/domain/dashboard";
export const GET = (
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) =>
  entry(request, async (actor, db) =>
    projectOverview(
      db,
      actor,
      uuid(new URL(request.url).searchParams.get("workspaceId")),
      uuid((await context.params).projectId),
    ),
  );
