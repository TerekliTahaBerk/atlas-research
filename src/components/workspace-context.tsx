"use client";
import {
  createContext,
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
import type { Me, Workspace, Project } from "./workspace-shell";
type Resource<T> = { data?: T; error?: unknown; reload: () => void };
const Context = createContext<{
  me: Resource<Me>;
  workspaces: Resource<Workspace[]>;
  projects: Resource<Project[]>;
  inbox: Resource<{ id: string; readAt: string | null }[]>;
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
    inbox = useResource<{ id: string; readAt: string | null }[]>(
      active ? "/api/collaboration/inbox" : null,
    );
  const [collapsed, setCollapsed] = useState(false);
  const current = projects.data?.find(
    (p) =>
      path === `/w/${p.workspaceId}/p/${p.id}` ||
      path.startsWith(`/w/${p.workspaceId}/p/${p.id}/`),
  );
  return (
    <Context.Provider
      value={{ me, workspaces, projects, inbox, collapsed, setCollapsed }}
    >
      <div id="atlas-workspace-pages">{children}</div>
      {current && me.data && !me.error && !projects.error && (
        <AiCompanion
          key={me.data.user.id + ":" + current.id}
          w={current.workspaceId}
          p={current.id}
          userId={me.data.user.id}
          projectName={current.name}
        />
      )}
    </Context.Provider>
  );
}
export function useWorkspaceIdentity() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider required");
  return value;
}
