import type { ArtifactCard } from "./collaboration-types";
export type InboxItem = {
  id: string;
  event: string;
  readAt: string | null;
  createdAt: string;
  target: ArtifactCard | null;
  sender: string | null;
  projectName: string | null;
  excerpt: string | null;
  links: ArtifactCard[];
};
export type InboxPage = {
  items: InboxItem[];
  selected: InboxItem | null;
  snapshot: string;
  total: number;
  newCount: number;
  next: string | null;
};
export type Preferences = {
  assignment: boolean;
  reply: boolean;
  mention: boolean;
  revision: number;
  updatedAt: string | null;
};
export const notificationLabel = (event: string) =>
  event === "assignment"
    ? "Task assignment"
    : event === "mention"
      ? "Mention"
      : "Discussion reply";
