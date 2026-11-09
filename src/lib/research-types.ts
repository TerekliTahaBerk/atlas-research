export type MetadataInput = {
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  doi: string | null;
  url: string | null;
  abstract: string;
  provider?: string;
};
export type ResearchSource = MetadataInput & {
  id: string;
  workspaceId: string;
  projectId: string;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
export type ResearchVersion = {
  id: string;
  sourceId: string;
  ordinal: number;
  fileId: string | null;
  extractionStatus: string;
  pageCount: number | null;
  textCharacters: number | null;
  createdAt: string;
};
export type ResearchFile = {
  id: string;
  filename: string;
  bytes: number;
  sha256: string;
};
export type Reading = {
  sourceId: string;
  versionId: string | null;
  status: string;
  page: number;
  zoom: number;
  position: number;
};
export type ReaderPosition = {
  versionId: string;
  page: number;
  zoom: number;
  zoomMode: string;
  position: number;
};
export type ResearchAnnotation = {
  id: string;
  sourceId: string;
  versionId: string;
  authorId: string;
  kind: string;
  page: number;
  quote: string;
  body: string;
  rects: number[][];
  color: string;
  revision: number;
  createdAt: string;
};
export type ResearchCollection = { id: string; name: string; count?: number };
export type ResearchDetail = {
  source: ResearchSource;
  versions: ResearchVersion[];
  files: ResearchFile[];
  annotations: ResearchAnnotation[];
  reading: Reading | null;
  positions: ReaderPosition[];
  collections: ResearchCollection[];
  collectionIds: string[];
  role: string;
  canEdit: boolean;
  storageAvailable: boolean;
  jobs: { versionId: string; state: string; error: string | null }[];
};
export type ResearchLibrary = {
  items: ResearchSource[];
  versions: ResearchVersion[];
  readings: Reading[];
  collections: ResearchCollection[];
  links: { sourceId: string; collectionId: string }[];
  tags: string[];
  role: string;
  canEdit: boolean;
  hasMore: boolean;
  total: number;
  years: number[];
  counts: {
    all: number;
    archived: number;
    unread: number;
    reading: number;
    done: number;
  };
  storageAvailable: boolean;
};
export type DiscoveryItem = MetadataInput & {
  providerId: string;
  existingSourceId?: string;
};
