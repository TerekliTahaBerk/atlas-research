// Server entry point: official provider SDKs never enter the browser bundle.
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AIProvider, AIRequest, AIResponse, AIStreamEvent } from './index';
import {
  groundedAnswer,
  modelPolicy,
  researchInstructions,
  requestInputBound,
  tokenBound,
  verifyCitations,
  validateVector,
  type ModelPolicy,
  type EmbeddingProvider,
} from './research';

export class ProviderFailure extends Error {
  constructor(
    readonly code: import('./index').AIErrorCode,
    readonly finishReason?: AIResponse['finishReason'],
  ) {
    super(code);
  }
}
export function providerFailure(error: unknown, signal: AbortSignal) {
  if (signal.aborted)
    return new ProviderFailure(
      z.object({ name: z.literal('TimeoutError') }).safeParse(signal.reason)
        .success
        ? 'TIMEOUT'
        : 'CANCELLED',
    );
  if (error instanceof ProviderFailure) return error;
  if (
    (error instanceof OpenAI.APIError || error instanceof Anthropic.APIError) &&
    error.status === 429
  )
    return new ProviderFailure('RATE_LIMITED');
  if (error instanceof SyntaxError || error instanceof z.ZodError)
    return new ProviderFailure('INVALID_OUTPUT');
  return new ProviderFailure('PROVIDER_UNAVAILABLE');
}
const schema = z.toJSONSchema(groundedAnswer, { target: 'draft-7' });
/** Decode only the first JSON text member; provisional output has no verification status. */
export function provisionalText(json: string) {
  const match = /^\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)/.exec(json);
  if (!match) return '';
  let value = match[1] ?? '';
  while (value) {
    try {
      return z.string().parse(JSON.parse(`"${value}"`));
    } catch {
      value = value.slice(0, -1);
    }
  }
  return '';
}
export class OfficialResearchProvider implements AIProvider {
  readonly id: string;
  private readonly policy: ModelPolicy;
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  constructor(policy: ModelPolicy, apiKey: string, transport?: typeof fetch) {
    this.policy = modelPolicy.parse(policy);
    if (
      !apiKey ||
      typeof window !== 'undefined' ||
      !['openai', 'anthropic'].includes(policy.provider)
    )
      throw new ProviderFailure('PROVIDER_UNAVAILABLE');
    this.id = policy.provider;
    const options = {
      apiKey,
      maxRetries: 0,
      timeout: 60000,
      ...(transport ? { fetch: transport } : {}),
    };
    this.openai = new OpenAI({
      ...options,
      baseURL: 'https://api.openai.com/v1',
    });
    this.anthropic = new Anthropic({
      ...options,
      baseURL: 'https://api.anthropic.com',
    });
  }
  supports(config: AIRequest['config']) {
    return (
      config.provider === this.id &&
      config.model === this.policy.model &&
      Number.isInteger(config.maxOutputTokens) &&
      config.maxOutputTokens > 0 &&
      config.maxOutputTokens <= this.policy.maxOutputTokens
    );
  }
  private options(request: AIRequest) {
    if (
      !this.supports(request.config) ||
      request.tools.length ||
      request.messages.some((m) => m.role === 'system') ||
      request.outputSchema
    )
      throw new ProviderFailure('CONTEXT_FORBIDDEN');
    const messages = [
      ...request.messages.map((m) => ({
        role:
          m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: `UNTRUSTED_EVIDENCE_JSON\n${JSON.stringify(request.context.evidence ?? [])}`,
      },
    ];
    // Include serialized output schema and protocol overhead in the conservative reservation bound.
    if (
      requestInputBound(request.messages, request.context.evidence ?? []) +
        request.config.maxOutputTokens >
      this.policy.contextTokens
    )
      throw new ProviderFailure('INVALID_OUTPUT');
    return {
      messages,
      signal: AbortSignal.any([
        ...(request.signal ? [request.signal] : []),
        AbortSignal.timeout(60000),
      ]),
    };
  }
  private response(
    request: AIRequest,
    json: string,
    input: number | undefined,
    output: number | undefined,
    finishReason: AIResponse['finishReason'],
  ): AIResponse {
    if (finishReason !== 'stop')
      throw new ProviderFailure('INVALID_OUTPUT', finishReason);
    if (
      !Number.isSafeInteger(input) ||
      !Number.isSafeInteger(output) ||
      input! < 0 ||
      output! < 0
    )
      throw new ProviderFailure('INVALID_OUTPUT');
    const answer = groundedAnswer.parse(JSON.parse(json) as unknown);
    const grounded = verifyCitations(answer, request.context.evidence ?? []);
    return {
      text: grounded.text,
      grounded,
      citations: [],
      usage: { inputTokens: input!, outputTokens: output! },
      finishReason,
    };
  }
  async generate(request: AIRequest) {
    const { messages, signal } = this.options(request);
    try {
      signal.throwIfAborted();
      if (this.id === 'openai') {
        const result = await this.openai.responses.create(
          {
            model: this.policy.model,
            input: messages,
            instructions: researchInstructions,
            max_output_tokens: request.config.maxOutputTokens,
            store: false,
            text: {
              format: {
                type: 'json_schema',
                name: 'atlas_research',
                strict: true,
                schema,
              },
            },
          },
          { signal },
        );
        if (
          result.output.some(
            (item) => item.type !== 'message' && item.type !== 'reasoning',
          )
        )
          throw new ProviderFailure('CONTEXT_FORBIDDEN', 'tool');
        return this.response(
          request,
          result.output_text,
          result.usage?.input_tokens,
          result.usage?.output_tokens,
          result.status === 'completed'
            ? 'stop'
            : result.incomplete_details?.reason === 'max_output_tokens'
              ? 'length'
              : 'blocked',
        );
      }
      const result = await this.anthropic.messages.create(
        {
          model: this.policy.model,
          max_tokens: request.config.maxOutputTokens,
          system: researchInstructions,
          messages,
          output_config: { format: { type: 'json_schema', schema } },
        },
        { signal },
      );
      if (
        result.content.some(
          (block) =>
            block.type !== 'text' &&
            block.type !== 'thinking' &&
            block.type !== 'redacted_thinking',
        )
      )
        throw new ProviderFailure('CONTEXT_FORBIDDEN', 'tool');
      return this.response(
        request,
        result.content
          .flatMap((b) => (b.type === 'text' ? [b.text] : []))
          .join(''),
        result.usage.input_tokens +
          (result.usage.cache_creation_input_tokens ?? 0) +
          (result.usage.cache_read_input_tokens ?? 0),
        result.usage.output_tokens,
        result.stop_reason === 'end_turn'
          ? 'stop'
          : result.stop_reason === 'max_tokens'
            ? 'length'
            : 'blocked',
      );
    } catch (error) {
      throw providerFailure(error, signal);
    }
  }
  async *stream(request: AIRequest): AsyncIterable<AIStreamEvent> {
    const { messages, signal } = this.options(request);
    let json = '',
      previous = '';
    const delta = () => {
      if (json.length > 150000) throw new ProviderFailure('INVALID_OUTPUT');
      const text = provisionalText(json);
      const next = text.startsWith(previous) ? text.slice(previous.length) : '';
      if (next) previous = text;
      return next;
    };
    try {
      signal.throwIfAborted();
      if (this.id === 'openai') {
        const stream = await this.openai.responses.create(
          {
            model: this.policy.model,
            input: messages,
            instructions: researchInstructions,
            max_output_tokens: request.config.maxOutputTokens,
            store: false,
            stream: true,
            text: {
              format: {
                type: 'json_schema',
                name: 'atlas_research',
                strict: true,
                schema,
              },
            },
          },
          { signal },
        );
        let complete = false;
        for await (const event of stream) {
          signal.throwIfAborted();
          if (event.type === 'response.output_text.delta') {
            json += event.delta;
            const text = delta();
            if (text) yield { type: 'delta', text };
          } else if (
            event.type === 'response.output_item.added' &&
            event.item.type !== 'message' &&
            event.item.type !== 'reasoning'
          )
            throw new ProviderFailure('CONTEXT_FORBIDDEN', 'tool');
          else if (event.type === 'response.completed') {
            const result = event.response;
            yield {
              type: 'complete',
              response: this.response(
                request,
                json,
                result.usage?.input_tokens,
                result.usage?.output_tokens,
                'stop',
              ),
            };
            complete = true;
          } else if (event.type === 'response.incomplete')
            throw new ProviderFailure(
              'INVALID_OUTPUT',
              event.response.incomplete_details?.reason === 'max_output_tokens'
                ? 'length'
                : 'blocked',
            );
          else if (event.type === 'response.failed' || event.type === 'error')
            throw new ProviderFailure('PROVIDER_UNAVAILABLE');
        }
        if (!complete) throw new ProviderFailure('PROVIDER_UNAVAILABLE');
      } else {
        const stream = await this.anthropic.messages.create(
          {
            model: this.policy.model,
            max_tokens: request.config.maxOutputTokens,
            system: researchInstructions,
            messages,
            stream: true,
            output_config: { format: { type: 'json_schema', schema } },
          },
          { signal },
        );
        let input: number | undefined,
          output: number | undefined,
          reason: AIResponse['finishReason'] = 'blocked',
          complete = false;
        for await (const event of stream) {
          signal.throwIfAborted();
          if (event.type === 'message_start') {
            input =
              event.message.usage.input_tokens +
              (event.message.usage.cache_creation_input_tokens ?? 0) +
              (event.message.usage.cache_read_input_tokens ?? 0);
          } else if (
            event.type === 'content_block_start' &&
            event.content_block.type !== 'text' &&
            event.content_block.type !== 'thinking' &&
            event.content_block.type !== 'redacted_thinking'
          )
            throw new ProviderFailure('CONTEXT_FORBIDDEN', 'tool');
          else if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            json += event.delta.text;
            const text = delta();
            if (text) yield { type: 'delta', text };
          } else if (event.type === 'message_delta') {
            output = event.usage.output_tokens;
            reason =
              event.delta.stop_reason === 'end_turn'
                ? 'stop'
                : event.delta.stop_reason === 'max_tokens'
                  ? 'length'
                  : 'blocked';
          } else if (event.type === 'message_stop') {
            yield {
              type: 'complete',
              response: this.response(request, json, input, output, reason),
            };
            complete = true;
          }
        }
        if (!complete) throw new ProviderFailure('PROVIDER_UNAVAILABLE');
      }
    } catch (error) {
      const failure = providerFailure(error, signal);
      yield {
        type: 'error',
        code: failure.code,
        retryable: false,
        ...(failure.finishReason ? { finishReason: failure.finishReason } : {}),
      };
    }
  }
}
export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly dimensions = 768;
  private readonly client: OpenAI;
  constructor(
    readonly modelId: string,
    apiKey: string,
    transport?: typeof fetch,
  ) {
    if (typeof window !== 'undefined' || !apiKey)
      throw new ProviderFailure('PROVIDER_UNAVAILABLE');
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 0,
      timeout: 30000,
      ...(transport ? { fetch: transport } : {}),
    });
  }
  async embedDocuments(texts: readonly string[], signal?: AbortSignal) {
    if (
      !texts.length ||
      texts.length > 16 ||
      texts.some((t) => !t.length || tokenBound(t) > 8000)
    )
      throw new ProviderFailure('INVALID_OUTPUT');
    const result = await this.client.embeddings.create(
      {
        model: this.modelId,
        input: [...texts],
        dimensions: this.dimensions,
        encoding_format: 'float',
      },
      {
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(30000),
        ]),
      },
    );
    if (
      result.data.length !== texts.length ||
      new Set(result.data.map((r) => r.index)).size !== texts.length
    )
      throw new ProviderFailure('INVALID_OUTPUT');
    return result.data
      .sort((a, b) => a.index - b.index)
      .map((r, i) => {
        if (r.index !== i) throw new ProviderFailure('INVALID_OUTPUT');
        return validateVector(r.embedding, this.dimensions);
      });
  }
  async embedQuery(text: string, signal?: AbortSignal) {
    const [vector] = await this.embedDocuments([text], signal);
    if (!vector) throw new ProviderFailure('INVALID_OUTPUT');
    return vector;
  }
}
