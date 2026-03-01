/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ToolCallingModel, type ToolDefinition } from './ToolCallingModel';

export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}>;

export interface AgentLoopConfig {
  model: ToolCallingModel;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  maxIterations?: number;
  signal?: AbortSignal;
  onIteration?: (
    iteration: number,
    messages: ChatCompletionMessageParam[],
  ) => void;
  logger?: Pick<Console, 'info' | 'error' | 'warn'>;
}

export interface AgentLoopResult {
  finalText: string | null;
  iterations: number;
  totalTokens: number;
  stoppedReason: 'completed' | 'max_iterations' | 'aborted' | 'error';
  messages: ChatCompletionMessageParam[];
}

export class AgentLoop {
  private config: AgentLoopConfig;

  constructor(config: AgentLoopConfig) {
    this.config = config;
  }

  async run(params: {
    systemPrompt: string;
    userMessage: string;
    images?: string[];
    additionalContext?: ChatCompletionMessageParam[];
  }): Promise<AgentLoopResult> {
    const {
      model,
      tools,
      toolHandlers,
      maxIterations = 25,
      signal,
      onIteration,
      logger,
    } = this.config;
    const messages: ChatCompletionMessageParam[] = [];

    // System message
    messages.push({ role: 'system', content: params.systemPrompt });

    // Additional context (e.g., memory, previous agent results)
    if (params.additionalContext) {
      messages.push(...params.additionalContext);
    }

    // User message (with optional images)
    if (params.images && params.images.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: params.userMessage },
          ...params.images.map((img) => ({
            type: 'image_url' as const,
            image_url: {
              url: img.startsWith('data:')
                ? img
                : `data:image/png;base64,${img}`,
            },
          })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: params.userMessage });
    }

    let iterations = 0;
    let totalTokens = 0;

    while (iterations < maxIterations) {
      if (signal?.aborted) {
        return {
          finalText: null,
          iterations,
          totalTokens,
          stoppedReason: 'aborted',
          messages,
        };
      }

      iterations++;
      onIteration?.(iterations, messages);

      const response = await model.invokeWithTools({
        messages,
        tools,
        signal,
      });

      totalTokens += response.costTokens ?? 0;

      // No tool calls — model is done
      if (response.toolCalls.length === 0) {
        return {
          finalText: response.textContent,
          iterations,
          totalTokens,
          stoppedReason: 'completed',
          messages,
        };
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.textContent,
        tool_calls: response.toolCalls,
      } as ChatCompletionMessageParam);

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        const handler = toolHandlers[toolCall.function.name];
        let toolResult: string;

        if (!handler) {
          toolResult = JSON.stringify({
            error: `Unknown tool: ${toolCall.function.name}`,
          });
          logger?.error(`[AgentLoop] Unknown tool: ${toolCall.function.name}`);
        } else {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await handler(args);
            toolResult = JSON.stringify(result);
          } catch (e) {
            toolResult = JSON.stringify({
              error: e instanceof Error ? e.message : 'Tool execution failed',
            });
            logger?.error(
              `[AgentLoop] Tool ${toolCall.function.name} error:`,
              e,
            );
          }
        }

        // Add tool result message
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        } as ChatCompletionMessageParam);
      }
    }

    return {
      finalText: null,
      iterations,
      totalTokens,
      stoppedReason: 'max_iterations',
      messages,
    };
  }
}
