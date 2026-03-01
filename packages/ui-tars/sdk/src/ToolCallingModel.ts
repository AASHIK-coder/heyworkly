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
  }
}
