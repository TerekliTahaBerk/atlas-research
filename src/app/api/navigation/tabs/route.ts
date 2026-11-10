import { entry } from "@/server/entry";
import { resolveWorkTabs, tabInput } from "@/server/domain/navigation";
export const GET = (request: Request) =>
  entry(request, (a, db) =>
    resolveWorkTabs(
      db,
      a,
      tabInput.parse({
        hrefs: new URL(request.url).searchParams.getAll("href"),
      }).hrefs,
    ),
  );
