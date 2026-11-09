export type DashboardCounts = {
  sources: number;
  documents: number;
  tasks: number;
  discussions: number;
};
export type DashboardProject = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  workspaceName: string;
  workspaceArchivedAt?: string | null;
  role: string;
  counts: DashboardCounts;
};
export type WorkCard = {
  id: string;
  title: string;
  kind: "source" | "document";
  href: string;
  projectId: string;
  projectName: string;
  openedAt: string;
  updatedAt: string;
  page: number | null;
  version: number | null;
};
export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  href: string;
  projectId: string;
  workspaceId: string;
  projectName?: string;
  assignedToYou: boolean;
};
export type HomeDashboard = {
  projects: DashboardProject[];
  projectTotal: number;
  pageSize: number;
  recent: WorkCard[];
  assigned: DashboardTask[];
  dueSoon: DashboardTask[];
  assignedTotal: number;
  dueTotal: number;
  overdueTotal: number;
};
export type OverviewDashboard = {
  project: {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    updatedAt: string;
    archivedAt: string | null;
    deletedAt: string | null;
  };
  workspace: {
    id: string;
    name: string;
    kind: string;
    archivedAt: string | null;
  };
  role: string;
  canEdit: boolean;
  canManage: boolean;
  hasContent: boolean;
  counts: DashboardCounts;
  documents: {
    id: string;
    title: string;
    revision: number;
    updatedAt: string;
    href: string;
  }[];
  sources: {
    id: string;
    title: string;
    authors: string[];
    year: number | null;
    references: number;
    updatedAt: string;
    href: string;
  }[];
  tasks: DashboardTask[];
  discussions: { id: string; title: string; updatedAt: string; href: string }[];
  activity: {
    id: string;
    title: string;
    kind: string;
    updatedAt: string;
    href: string;
  }[];
};
