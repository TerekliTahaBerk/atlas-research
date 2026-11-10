// Stored working preferences contain identifiers/locators, never research titles or text.
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export type WorkLocation = {
  key: string;
  href: string;
  kind: string;
  w?: string;
  p?: string;
  id?: string;
};
export function workLocation(value: string): WorkLocation | null {
  let u: URL;
  try {
    u = new URL(value, "https://atlas.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://atlas.invalid") return null;
  const path = u.pathname.replace(new RegExp(uuid, "ig"), (id) =>
    id.toLowerCase(),
  );
  if (["/home", "/onboarding", "/inbox", "/settings", "/help"].includes(path)) {
    const kind = path === "/onboarding" ? "home" : path.slice(1),
      params = new URLSearchParams();
    const tab = u.searchParams.get("tab");
    if (
      kind === "settings" &&
      [
        "profile",
        "appearance",
        "notifications",
        "security",
        "workspaces",
      ].includes(tab ?? "")
    )
      params.set("tab", tab!);
    return {
      key: kind,
      kind,
      href: "/" + kind + (params.size ? "?" + params : ""),
    };
  }
  const ws = path.match(new RegExp(`^/w/(${uuid})/settings$`, "i"));
  if (ws)
    return {
      key: `workspace:${ws[1]}`,
      kind: "workspace",
      w: ws[1],
      href: path,
    };
  const m = path.match(
    new RegExp(
      `^/w/(${uuid})/p/(${uuid})(?:/(sources|docs|tasks|discussions|discover|settings|members)(?:/(${uuid})(/read)?)?)?$`,
      "i",
    ),
  );
  if (!m) return null;
  const [, w, p, part, id, read] = m;
  if (
    (id && !["sources", "docs", "tasks", "discussions"].includes(part)) ||
    (read && part !== "sources")
  )
    return null;
  const kind = id
    ? part === "sources"
      ? "source"
      : part === "docs"
        ? "document"
        : part === "tasks"
          ? "task"
          : "discussion"
    : part === "sources" || part === "discover"
      ? "library"
      : part === "docs"
        ? "documents"
        : part === "settings"
          ? "project-settings"
          : (part ?? "overview");
  const params = new URLSearchParams();
  for (const name of ["version", "annotation", "message"]) {
    const v = u.searchParams.get(name);
    if (v && new RegExp(`^${uuid}$`, "i").test(v))
      params.set(name, v.toLowerCase());
  }
  const page = u.searchParams.get("page");
  if (kind === "source" && page && /^\d{1,6}$/.test(page))
    params.set("page", page);
  if (
    kind === "library" &&
    (part === "discover" || u.searchParams.get("view") === "discover")
  )
    params.set("view", "discover");
  const href = kind === "library" ? `/w/${w}/p/${p}/sources` : path;
  return {
    key: `${w}/${p}/${kind}${id ? ":" + id : ""}`,
    kind,
    w,
    p,
    id,
    href: href + (params.size ? "?" + params : ""),
  };
}
export const workLabel = (kind: string) =>
  ({
    home: "Home",
    inbox: "Inbox",
    settings: "Account settings",
    help: "Pilot guide",
    workspace: "Workspace settings",
    "project-settings": "Project settings",
    overview: "Overview",
    library: "Library",
    documents: "Documents",
    tasks: "Tasks",
    discussions: "Discussions",
    members: "Project members",
    source: "Source",
    document: "Document",
    task: "Task",
    discussion: "Discussion",
  })[kind] ?? "Project settings";
