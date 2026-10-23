/** Provider-neutral design contracts. No provider, network calls, or tools are executed. */
export interface AIModelConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxOutputTokens: number;
}
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros?: number;
  currency?: string;
}
export interface ResearchCitation {
  sourceId: string;
  versionId: string;
  chunkId: string;
  quote: string;
  page?: number;
  startOffset?: number;
  endOffset?: number;
  verification: 'unverified' | 'verified';
}
export interface ResearchContext {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  permissionSnapshotId: string;
  sources: ReadonlyArray<{
    sourceId: string;
    versionId: string;
    text: string;
    chunkId: string;
  }>;
}
export interface ResearchTool {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  requiredCapability: string;
  sideEffect: 'none' | 'write';
}
export interface AIRequest {
  requestId: string;
  idempotencyKey: string;
  config: AIModelConfig;
  messages: readonly AIMessage[];
  context: ResearchContext;
  tools: readonly ResearchTool[];
  outputSchema?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}
export interface AIResponse {
  text: string;
  citations: readonly ResearchCitation[];
  usage: AIUsage;
  finishReason: 'stop' | 'length' | 'tool' | 'blocked';
}
export type AIStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'complete'; response: AIResponse }
  | { type: 'error'; code: AIErrorCode; retryable: boolean };
export type AIErrorCode =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_OUTPUT'
  | 'CONTEXT_FORBIDDEN'
  | 'CANCELLED';
export interface AIProvider {
  readonly id: string;
  supports(config: AIModelConfig): boolean;
  generate(request: AIRequest): Promise<AIResponse>;
  stream(request: AIRequest): AsyncIterable<AIStreamEvent>;
}

/**
 * Typed research context attached to Atlas AI chips by the Phase 02 screens.
 * It describes what the user pointed at; it never authorizes retrieval.
 * Phase 03 must re-check the actor's live project access and resolve the
 * immutable source version before reading any content.
 */
export type ResearchReference =
  | { kind: 'project'; projectId: string }
  | { kind: 'search-result'; projectId: string; candidateId: string }
  | { kind: 'paper'; projectId: string; projectPaperId: string }
  | {
      kind: 'source-version';
      projectId: string;
      projectPaperId: string;
      sourceVersionId: string;
    }
  | {
      kind: 'selection';
      projectId: string;
      projectPaperId: string;
      sourceVersionId: string;
      pageNumber: number;
      quote: string;
    }
  | {
      kind: 'annotation';
      projectId: string;
      projectPaperId: string;
      sourceVersionId: string;
      annotationId: string;
    };
