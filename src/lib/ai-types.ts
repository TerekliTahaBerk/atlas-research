export type AiArtifactSnapshot = {
  id: string;
  title: string;
  kind: string;
  revision?: number;
  versionId?: string;
  page?: number;
  text: string;
  href: string;
};
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
  reservedCredits: number;
  chargedCredits: number;
  providerCostState: string;
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
export type FoundingAiBudget = {
  capMicros: number;
  actualMicros: number;
  uncertainMicros: number;
  heldMicros: number;
  warning: boolean;
  allowed: boolean;
};
export type FoundingBudgetGate = Pick<FoundingAiBudget, "warning" | "allowed">;
export type AiPolicyView = {
  enabled: boolean;
  dailyBudgetMicros: number;
  revision: number;
  termsVersion: string;
  canManage: boolean;
  callsEnabled: boolean;
  keyConfigured: boolean;
  pricingAvailable: boolean;
  creditsEnforced: boolean;
  dailyOperationLimit: number;
  foundingBudget: FoundingBudgetGate | null;
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
    artifacts?: AiArtifactSnapshot[];
  };
  evidence: EvidenceView[];
  warnings: string[];
  reservedMicros: number;
  maxCredits: number;
  pricingVersion: string | null;
  policy: AiPolicyView;
};
export type AiConversationView = {
  conversation: {
    id: string;
    title: string;
    versionIds: string[];
    artifactIds?: string[];
    createdAt: string;
  };
  contexts: {
    id: string;
    question: string;
    artifacts?: AiArtifactSnapshot[];
    createdAt: string;
    evidence: EvidenceView[];
    run: AiRunView | null;
    reviews: { segment: number; verdict: string }[];
  }[];
  versions: AiVersion[];
  canEdit: boolean;
};

export type AiCostReport = {
  periodStart: string;
  founding: FoundingAiBudget;
  models: Array<{
    provider: string;
    model: string;
    pricingVersion: string;
    runs: number;
    actualMicros: number;
    uncertainMicros: number;
    heldMicros: number;
    credits: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheWrite30mTokens: number;
    cacheWrite12hTokens: number;
  }>;
  highCostRuns: Array<{
    id: string;
    workspaceId: string;
    model: string;
    actualMicros: number;
    heldMicros: number;
    costState: string;
    createdAt: string;
  }>;
};
