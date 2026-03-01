/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

export type ToolDefinition = ChatCompletionTool;

export interface ToolCallResult {
  toolCalls: ChatCompletionMessageToolCall[];
  textContent: string | null;
  costTime?: number;
  costTokens?: number;
  finishReason: string;
}

export interface ToolCallingModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export class ToolCallingModel {
  private config: ToolCallingModelConfig;

  constructor(config: ToolCallingModelConfig) {
    this.config = config;
  }

  get modelName(): string {
    return this.config.model;
  }

  async invokeWithTools(params: {
    messages: ChatCompletionMessageParam[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<ToolCallResult> {
    const { messages, tools, signal, headers } = params;
    const {
      baseURL,
      apiKey,
      model,
      temperature = 0,
      maxTokens = 4096,
    } = this.config;

    const openai = new OpenAI({ baseURL, apiKey, maxRetries: 0 });
    const startTime = Date.now();

    // Try with native tool calling first
    try {
      const result = await openai.chat.completions.create(
        {
          model,
          messages,
          tools,
          tool_choice: 'auto',
          stream: false,
          temperature,
          max_tokens: maxTokens,
        },
        { signal, timeout: 30_000, headers },
      );

      const choice = result.choices[0];
      return {
        toolCalls: choice?.message?.tool_calls ?? [],
        textContent: choice?.message?.content ?? null,
        costTime: Date.now() - startTime,
        costTokens: result.usage?.total_tokens ?? 0,
        finishReason: choice?.finish_reason ?? 'unknown',
      };
    } catch (err) {
      // If the provider doesn't support tool calling (404), fall back to
      // plain chat with tool schemas embedded in the prompt
      const isToolUseUnsupported =
        err instanceof OpenAI.APIError &&
        (err.status === 404 || err.status === 400) &&
        tools.length > 0;

      if (!isToolUseUnsupported) throw err;

      return this.invokeWithToolsFallback({
        messages,
        tools,
        signal,
        headers,
        openai,
        startTime,
        temperature,
        maxTokens,
      });
    }
  }

  /**
   * Fallback: send a plain chat completion with tool schemas described in the
   * system prompt, then parse the model's JSON text response into synthetic
   * tool calls.
   */
  private async invokeWithToolsFallback(params: {
    messages: ChatCompletionMessageParam[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
    headers?: Record<string, string>;
    openai: OpenAI;
    startTime: number;
    temperature: number;
    maxTokens: number;
  }): Promise<ToolCallResult> {
    const {
      messages,
      tools,
      signal,
      headers,
      openai,
      startTime,
      temperature,
      maxTokens,
    } = params;

    // Build a description of each tool for the system prompt
    const toolDescriptions = tools
      .map((t) => {
        const fn = t.function;
        return `Function: ${fn.name}\nDescription: ${fn.description}\nParameters: ${JSON.stringify(fn.parameters, null, 2)}`;
      })
      .join('\n\n');

    const fallbackInstruction = [
      'You have access to the following functions. To call a function, respond with a JSON object in this exact format:',
      '{"name": "<function_name>", "arguments": {<arguments>}}',
      '',
      'Available functions:',
      toolDescriptions,
      '',
      'IMPORTANT: Respond ONLY with the JSON function call, no other text.',
    ].join('\n');

    // Prepend the tool instruction to the messages
    const augmentedMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: fallbackInstruction },
      ...messages,
    ];

    const result = await openai.chat.completions.create(
      {
        model: this.config.model,
        messages: augmentedMessages,
        stream: false,
        temperature,
        max_tokens: maxTokens,
      },
      { signal, timeout: 60_000, headers },
    );

    const choice = result.choices[0];
    const text = choice?.message?.content ?? '';

    // Try to parse a synthetic tool call from the text
    const toolCalls = this.parseToolCallsFromText(text, tools);

    return {
      toolCalls,
      textContent: toolCalls.length > 0 ? null : text,
      costTime: Date.now() - startTime,
      costTokens: result.usage?.total_tokens ?? 0,
      finishReason: choice?.finish_reason ?? 'unknown',
    };
  }

  /**
   * Extract tool calls from plain-text model output. Looks for JSON objects
   * that match one of the defined tool names.
   */
  private parseToolCallsFromText(
    text: string,
    tools: ToolDefinition[],
  ): ChatCompletionMessageToolCall[] {
    const toolNames = new Set(tools.map((t) => t.function.name));

    // Find JSON objects in the text (handle markdown code fences)
    const cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);

      // Direct format: {"name": "fn", "arguments": {...}}
      if (parsed.name && toolNames.has(parsed.name)) {
        return [
          {
            id: `call_fallback_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: parsed.name,
              arguments:
                typeof parsed.arguments === 'string'
                  ? parsed.arguments
                  : JSON.stringify(parsed.arguments ?? {}),
            },
          },
        ];
      }

      // The model may have returned the arguments directly for a single tool
      if (tools.length === 1 && typeof parsed === 'object') {
        return [
          {
            id: `call_fallback_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: tools[0].function.name,
              arguments: JSON.stringify(parsed),
            },
          },
        ];
      }
    } catch {
      // Not valid JSON — return empty, caller uses fallback path
    }

    return [];
  }
}
