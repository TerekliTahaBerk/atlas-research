"use client";
import { DiscussionsExperience } from "./discussions-experience";
import { TasksExperience } from "./tasks-experience";
import { WorkspaceShell } from "./workspace-shell";
import { InboxExperience } from "./inbox-experience";
export function CollaborationScreen({
  w,
  p,
  mode,
  id,
}: {
  w: string;
  p: string;
  mode: "tasks" | "discussions";
  id?: string;
}) {
  return (
    <WorkspaceShell
      title={mode === "tasks" ? "Tasks" : "Discussions"}
      surface={mode}
    >
      {({ me }) =>
        mode === "tasks" ? (
          <TasksExperience
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            userId={me.user.id}
            initialId={id}
          />
        ) : (
          <DiscussionsExperience
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            id={id}
            userId={me.user.id}
          />
        )
      }
    </WorkspaceShell>
  );
}
export function InboxScreen() {
  return <WorkspaceShell title="Inbox" surface="inbox">{({me})=><InboxExperience key={me.user.id} userId={me.user.id}/>}</WorkspaceShell>;
}
