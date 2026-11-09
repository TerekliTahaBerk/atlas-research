import type { DocNode } from "./document-model";
export type ArtifactCard = {
  id: string;
  kind: string;
  title: string;
  href: string;
  archived: boolean;
};
export type CitationView = {
  id: string;
  sourceId: string;
  versionId: string;
  annotationId: string | null;
  pageId?: string | null;
  start?: number | null;
  end?: number | null;
  page: number | null;
  quote: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  url: string | null;
  href: string;
  archived: boolean;
  unavailable: boolean;
};
export type DocumentData = {
  id: string;
  title: string;
  body: DocNode;
  revision: number;
  archivedAt: string | null;
  updatedAt: string;
};
export type DocumentDetail = {
  document: DocumentData;
  citations: CitationView[];
  versions: {
    id: string;
    revision: number;
    title: string;
    createdAt: string;
    createdBy?: string;
  }[];
  links: ArtifactCard[];
  canEdit: boolean;
  canManage: boolean;
};
export type TaskData = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: string | null;
  position?: number;
  createdAt?: string;
  links?: ArtifactCard[];
  revision: number;
  archivedAt: string | null;
  updatedAt: string;
};
export const taskStatuses = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
] as const;
export const statusName = (s: string) =>
  ({
    backlog: "Backlog",
    in_progress: "In progress",
    in_review: "In review",
    done: "Done",
  })[s] ?? s;
export type DiscussionData = {
  revision?: number;
  archivedAt?: string | null;
  id: string;
  title: string;
  createdBy: string;
  updatedAt: string;
};
export type MessageData = {
  links?: ArtifactCard[];
  orderStamp?: string;
  mentions?: string[];
  id: string;
  authorId: string;
  artifactIds: string[];
  body: string;
  revision: number;
  editedAt: string | null;
  createdAt: string;
};
export type Member = {
  userId: string;
  name: string;
  role: string;
  active: boolean;
};
