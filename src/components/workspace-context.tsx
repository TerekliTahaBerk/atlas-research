"use client";
import {
  createContext,
  useEffect,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import dynamic from "next/dynamic";
const AiCompanion = dynamic(
  () => import("./ai-companion").then((m) => m.AiCompanion),
  { ssr: false },
);
import { usePathname } from "next/navigation";
import { useResource } from "./ui";
import { WorkspaceSearch } from "./workspace-search";
import { NavigationSafety } from "./navigation-safety";
import type { Me, Workspace, Project } from "./workspace-shell";
type Resource<T> = { data?: T; error?: unknown; reload: () => void };
const Context = createContext<{
  me: Resource<Me>;
  workspaces: Resource<Workspace[]>;
  projects: Resource<Project[]>;
  inbox: Resource<{ unread: number }>;
  openSearch: () => void;
  selectedProject?: Project;
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
} | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = [
    "/home",
    "/onboarding",
    "/inbox",
    "/settings",
    "/help",
    "/w/",
  ].some(
    (prefix) =>
      path === prefix ||
      path.startsWith(prefix.endsWith("/") ? prefix : prefix + "/"),
  );
  // Keep the authenticated chrome mounted across research routes. Each endpoint
  // still rechecks the session, and useResource clears denied results.
  const me = useResource<Me>(active ? "/api/me" : null),
    workspaces = useResource<Workspace[]>(active ? "/api/workspaces" : null),
    projects = useResource<Project[]>(active ? "/api/projects" : null),
    inbox = useResource<{ unread: number }>(
      active ? "/api/collaboration/inbox?view=summary" : null,
    );
  const actor = me.data?.user.id;
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        active &&
        actor &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        setSearching(true);
      }
    };
    const close = () => setSearching(false);
    window.addEventListener("keydown", key);
    window.addEventListener("atlas-navigation-start", close);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("atlas-navigation-start", close);
    };
  }, [active, actor]);
  useEffect(() => {
    queueMicrotask(() => setSearching(false));
  }, [actor, active]);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarActor, setSidebarActor] = useState("");
  useEffect(() => {
    if (!actor) return;
    const user = actor;
    let closed = false;
    try {
      closed = sessionStorage.getItem(`atlas-sidebar:${user}`) === "closed";
    } catch {}
    queueMicrotask(() => {
      setCollapsed(closed);
      setSidebarActor(user);
    });
  }, [actor]);
  useEffect(() => {
    if (sidebarActor && sidebarActor === me.data?.user.id)
      try {
        sessionStorage.setItem(
          `atlas-sidebar:${sidebarActor}`,
          collapsed ? "closed" : "open",
        );
      } catch {}
  }, [sidebarActor, collapsed, me.data?.user.id]);
  const current = projects.data?.find(
    (p) =>
      path === `/w/${p.workspaceId}/p/${p.id}` ||
      path.startsWith(`/w/${p.workspaceId}/p/${p.id}/`),
  );
  const [remembered, setRemembered] = useState<{ user: string; id: string }>();
  useEffect(() => {
    if (!me.data) return;
    const user = me.data.user.id;
    let id = current?.id ?? "";
    try {
      if (id) sessionStorage.setItem(`atlas-project:${user}`, id);
      else id = sessionStorage.getItem(`atlas-project:${user}`) ?? "";
    } catch {}
    queueMicrotask(() =>
      setRemembered((old) =>
        old?.user === user && old.id === id ? old : { user, id },
      ),
    );
  }, [me.data?.user.id, current?.id, me.data]);
  const rememberedProject =
    remembered?.user === actor
      ? projects.data?.find((p) => p.id === remembered?.id && !p.deletedAt)
      : undefined;
  const workspaceScope = path.match(/^\/w\/([^/]+)\/settings$/)?.[1];
  const selectedProject =
    current ??
    (!/^\/w\/[^/]+\/p\//.test(path) &&
    (!workspaceScope || rememberedProject?.workspaceId === workspaceScope)
      ? rememberedProject
      : undefined);
  return (
    <Context.Provider
      value={{
        me,
        workspaces,
        projects,
        inbox,
        collapsed,
        setCollapsed,
        selectedProject,
        openSearch: () => setSearching(true),
      }}
    >
      <NavigationSafety>
        <div id="atlas-workspace-pages">{children}</div>
        {searching && active && actor && !me.error && !projects.error && (
          <WorkspaceSearch key={actor} close={() => setSearching(false)} />
        )}
        {selectedProject && me.data && !me.error && !projects.error && (
          <AiCompanion
            key={me.data.user.id + ":" + selectedProject.id}
            w={selectedProject.workspaceId}
            p={selectedProject.id}
            userId={me.data.user.id}
            projectName={selectedProject.name}
          />
        )}
      </NavigationSafety>
    </Context.Provider>
  );
}
export function useWorkspaceIdentity() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider required");
  return value;
}
