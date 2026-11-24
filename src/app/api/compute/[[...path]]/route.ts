import { entry, uuid } from "@/server/entry";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { readMutation } from "@/server/http";
import {
  cancelCompute,
  computeRequest,
  enqueueCompute,
  readCompute,
  readComputeJob,
  readComputePdf,
} from "@/server/compute/service";

type Context = { params: Promise<{ path?: string[] }> };
function scope(request: Request) {
  const params = new URL(request.url).searchParams;
  return {
    workspaceId: uuid(params.get("workspaceId")),
    projectId: uuid(params.get("projectId")),
  };
}

export function GET(request: Request, context: Context) {
  return entry(request, async (actor, db) => {
    const path = (await context.params).path ?? [];
    const project = scope(request);
    if (path.length === 0) return readCompute(db, actor, project);
    if (path.length === 1)
      return readComputeJob(db, actor, project, uuid(path[0]));
    if (path.length === 2 && path[1] === "pdf")
      return readComputePdf(db, actor, project, uuid(path[0]));
    throw new AppError("UNAVAILABLE", 404);
  });
}

export function POST(request: Request, context: Context) {
  return entry(request, async (actor, db) => {
    if ((await context.params).path?.length)
      throw new AppError("UNAVAILABLE", 404);
    return enqueueCompute(
      db,
      actor,
      await readMutation(request, computeRequest, 210_000),
    );
  });
}

export function DELETE(request: Request, context: Context) {
  return entry(request, async (actor, db) => {
    if (request.headers.get("origin") !== getEnv().APP_ORIGIN)
      throw new AppError("INVALID_INPUT", 403);
    const path = (await context.params).path ?? [];
    if (path.length !== 1) throw new AppError("UNAVAILABLE", 404);
    return cancelCompute(db, actor, scope(request), uuid(path[0]));
  });
}
