import { entry } from "@/server/entry";
import { searchInput, searchWork } from "@/server/domain/navigation";
export const GET = (request: Request) =>
  entry(request, (a, db) => {
    const p = new URL(request.url).searchParams;
    return searchWork(
      db,
      a,
      searchInput.parse({
        q: p.get("q"),
        page: p.get("page") ?? 0,
        kind: p.get("kind") ?? "all",
      }),
    );
  });
