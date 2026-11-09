export type AiVersion = {
  id: string;
  sourceId: string;
  title: string;
  ordinal: number;
  status: string;
  indexed: boolean;
  file: boolean;
  pages: number | null;
};
export type EvidenceView = {
  id: string;
  sourceId: string;
  versionId: string;
  pageId: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  quoteHash: string;
  fileSha256: string;
  extractor: string;
  title: string;
  href: string;
};
export type AiAnswer = {
  status: "answered" | "insufficient";
  segments: {
    text: string;
    citations: { evidenceId: string; quote: string }[];
  }[];
  limitations: string;
};
export type AiRunView = {
  id: string;
  contextId: string;
  state: string;
  error: string | null;
  result: AiAnswer | null;
  reservedMicros: number;
  chargedMicros: number;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
export type AiUsage = {
  activeWorkspace: number;
  activeUser: number;
  requests: number;
  spentMicros: number;
  heldMicros: number;
};
export type AiPolicyView = {
  enabled: boolean;
  dailyBudgetMicros: number;
  revision: number;
  termsVersion: string;
  canManage: boolean;
  callsEnabled: boolean;
  keyConfigured: boolean;
  model: string;
  terms: string;
  testing: boolean;
  usage: AiUsage;
};
export type AiContextView = {
  context: {
    id: string;
    question: string;
    conversationId: string;
    expiresAt: string;
  };
  evidence: EvidenceView[];
  warnings: string[];
  reservedMicros: number;
  policy: AiPolicyView;
};
export type AiConversationView = {
  conversation: {
    id: string;
    title: string;
    versionIds: string[];
    createdAt: string;
  };
  contexts: {
    id: string;
    question: string;
    createdAt: string;
    evidence: EvidenceView[];
    run: AiRunView | null;
    reviews: { segment: number; verdict: string }[];
  }[];
  versions: AiVersion[];
  canEdit: boolean;
};
