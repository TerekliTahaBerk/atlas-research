// Server entry point. Never import this module into client components.
import { createGoogle } from '@ai-sdk/google';
import { OfficialResearchProvider } from './official-providers';
export {
  OfficialResearchProvider,
  OpenAIEmbeddings,
  ProviderFailure,
} from './official-providers';
import {
  APICallError,
  generateText,
  streamText,
  Output,
  embedMany,
  type LanguageModel,
} from 'ai';
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIStreamEvent,
  AIErrorCode,
} from './index';
import {
  groundedAnswer,
  modelPolicy,
  researchInstructions,
  tokenBound,
  verifyCitations,
  validateVector,
  type ModelPolicy,
  type EmbeddingProvider,
} from './research';

export class ModelFailure extends Error {
  constructor(readonly code: AIErrorCode) {
    super(code);
  }
}
export function normalizeModelError(
  error: unknown,
  signal?: AbortSignal,
): ModelFailure {
  if (signal?.aborted)
    return new ModelFailure(
      typeof signal.reason === 'object' &&
        signal.reason !== null &&
        'name' in signal.reason &&
        signal.reason.name === 'TimeoutError'
        ? 'TIMEOUT'
        : 'CANCELLED',
    );
  if (error instanceof ModelFailure) return error;
  if (APICallError.isInstance(error) && error.statusCode === 429)
    return new ModelFailure('RATE_LIMITED');
  return new ModelFailure('PROVIDER_UNAVAILABLE');
}
export class SDKResearchProvider implements AIProvider {
  readonly id: string;
  private readonly policy: ModelPolicy;
  private readonly model: LanguageModel;
  private readonly official?: AIProvider;
  constructor(policy: ModelPolicy, apiKey: string, transport?: typeof fetch) {
    this.policy = modelPolicy.parse(policy);
    if (!apiKey || typeof window !== 'undefined')
      throw new ModelFailure('PROVIDER_UNAVAILABLE');
    this.id = policy.provider;
    const options = { apiKey, ...(transport ? { fetch: transport } : {}) };
    this.model = createGoogle(options)(policy.model);
    if (policy.provider !== 'google')
      this.official = new OfficialResearchProvider(policy, apiKey, transport);
  }
  supports(config: AIRequest['config']) {
    return (
      config.provider === this.id &&
      config.model === this.policy.model &&
      config.maxOutputTokens <= this.policy.maxOutputTokens
    );
  }
  private options(request: AIRequest) {
    // No model-authorized tool execution. Trusted read tools resolve before generation.
    if (
      !this.supports(request.config) ||
      request.tools.length ||
      request.messages.some((m) => m.role === 'system')
    )
      throw new ModelFailure('CONTEXT_FORBIDDEN');
    const messages = [
      ...request.messages,
      {
        role: 'user' as const,
        content: `UNTRUSTED_EVIDENCE_JSON\n${JSON.stringify(request.context.evidence ?? [])}`,
      },
    ];
    if (
      tokenBound(researchInstructions + JSON.stringify(messages)) +
        request.config.maxOutputTokens >
      this.policy.contextTokens
    )
      throw new ModelFailure('INVALID_OUTPUT');
    return {
      model: this.model,
      instructions: researchInstructions,
      messages,
      output: Output.object({ schema: groundedAnswer }),
      maxOutputTokens: request.config.maxOutputTokens,
      maxRetries: 0,
      abortSignal: AbortSignal.any([
        ...(request.signal ? [request.signal] : []),
        AbortSignal.timeout(60000),
      ]),
    };
  }
  private response(
    request: AIRequest,
    answer: unknown,
    usage: {
      inputTokens?: number | undefined;
      outputTokens?: number | undefined;
    },
    reason: string,
  ): AIResponse {
    const parsed = groundedAnswer.safeParse(answer);
    if (!parsed.success || reason !== 'stop')
      throw new ModelFailure('INVALID_OUTPUT');
    if (
      !Number.isSafeInteger(usage.inputTokens) ||
      !Number.isSafeInteger(usage.outputTokens)
    )
      throw new ModelFailure('INVALID_OUTPUT');
    const grounded = verifyCitations(
      parsed.data,
      request.context.evidence ?? [],
    );
    return {
      text: grounded.text,
      grounded,
      citations: [],
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      finishReason: 'stop',
    };
  }
  async generate(request: AIRequest) {
    if (this.official) return this.official.generate(request);
    const options = this.options(request);
    try {
      const result = await generateText(options);
      return this.response(
        request,
        result.output,
        result.usage,
        result.finishReason,
      );
    } catch (error) {
      throw normalizeModelError(error, options.abortSignal);
    }
  }
  async *stream(request: AIRequest): AsyncIterable<AIStreamEvent> {
    if (this.official) {
      yield* this.official.stream(request);
      return;
    }
    const options = this.options(request);
    try {
      const result = streamText(options);
      let previous = '';
      for await (const partial of result.partialOutputStream) {
        const text = partial.text;
        if (typeof text === 'string' && text.startsWith(previous)) {
          const delta = text.slice(previous.length);
          previous = text;
          if (delta) yield { type: 'delta', text: delta };
        }
      }
      yield {
        type: 'complete',
        response: this.response(
          request,
          await result.output,
          await result.usage,
          await result.finishReason,
        ),
      };
    } catch (error) {
      yield {
        type: 'error',
        code: normalizeModelError(error, options.abortSignal).code,
        retryable: false,
      };
    }
  }
}
/** Google embedding adapter; caller reserves embedding budget before invoking. */
export class GoogleEmbeddings implements EmbeddingProvider {
  readonly dimensions = 768;
  constructor(
    readonly modelId: string,
    private readonly apiKey: string,
    private readonly transport?: typeof fetch,
  ) {
    if (
      typeof window !== 'undefined' ||
      !apiKey ||
      !/^[a-zA-Z0-9._-]{1,120}$/.test(modelId)
    )
      throw new Error('INVALID_EMBEDDING_CONFIG');
  }
  private async embed(
    texts: readonly string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
    signal?: AbortSignal,
  ) {
    if (
      !texts.length ||
      texts.length > 16 ||
      texts.some((t) => tokenBound(t) > 8000)
    )
      throw new Error('EMBEDDING_LIMIT');
    const result = await embedMany({
      model: createGoogle({
        apiKey: this.apiKey,
        ...(this.transport ? { fetch: this.transport } : {}),
      }).embedding(this.modelId),
      values: [...texts],
      maxRetries: 0,
      maxParallelCalls: 1,
      abortSignal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(30000),
      ]),
      providerOptions: {
        google: { outputDimensionality: this.dimensions, taskType },
      },
    });
    if (result.embeddings.length !== texts.length)
      throw new Error('INVALID_EMBEDDING_COUNT');
    return result.embeddings.map((v) => validateVector(v, this.dimensions));
  }
  embedDocuments(texts: readonly string[], signal?: AbortSignal) {
    return this.embed(texts, 'RETRIEVAL_DOCUMENT', signal);
  }
  async embedQuery(text: string, signal?: AbortSignal) {
    const [vector] = await this.embed([text], 'RETRIEVAL_QUERY', signal);
    if (!vector) throw new Error('INVALID_EMBEDDING_COUNT');
    return vector;
  }
}
