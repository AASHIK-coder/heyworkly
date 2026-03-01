/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolCallingModel } from '@ui-tars/sdk';
import {
  getPlannerSystemPrompt,
  getPlannerToolDefinition,
  type ExecutionPlan,
  type PlanStep,
} from './plannerPrompt';
import { logger } from '@main/logger';

export interface PlannerConfig {
  model: ToolCallingModel;
  availableAgents: string[];
  mcpToolsSummary?: string;
}

export class PlannerAgent {
  private model: ToolCallingModel;
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.model = config.model;
    this.config = config;
  }

  async createPlan(params: {
    instruction: string;
    memoryContext?: string;
    currentState?: string;
    signal?: AbortSignal;
  }): Promise<ExecutionPlan> {
    const systemPrompt = getPlannerSystemPrompt({
      availableAgents: this.config.availableAgents,
      mcpToolsSummary: this.config.mcpToolsSummary,
      memoryContext: params.memoryContext,
      currentState: params.currentState,
    });

    const result = await this.model.invokeWithTools({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: params.instruction },
      ],
      tools: [getPlannerToolDefinition(this.config.availableAgents)],
      signal: params.signal,
    });

    // Extract plan from tool call
    const planCall = result.toolCalls.find(
      (tc) => tc.function.name === 'create_plan',
    );
    if (!planCall) {
      // Fallback: single-step plan using the default agent
      logger.warn(
        '[PlannerAgent] Model did not call create_plan. Creating fallback plan.',
      );
      return {
        reasoning: 'Single-step task — no decomposition needed.',
        plan: [
          {
            id: 1,
            agent: this.inferAgent(params.instruction),
            task: params.instruction,
            depends_on: [],
            verify: true,
          },
        ],
      };
    }

    const parsed: ExecutionPlan = JSON.parse(planCall.function.arguments);
    logger.info(
      '[PlannerAgent] Created plan:',
      JSON.stringify(parsed, null, 2),
    );
    return parsed;
  }

  private inferAgent(instruction: string): 'browser' | 'desktop' | 'api' {
    const available = new Set(this.config.availableAgents);
    const lower = instruction.toLowerCase();
    if (
      available.has('browser') &&
      (lower.includes('website') ||
        lower.includes('browser') ||
        lower.includes('url') ||
        lower.includes('search') ||
        lower.includes('google'))
    ) {
      return 'browser';
    }
    if (
      available.has('api') &&
      (lower.includes('email') ||
        lower.includes('api') ||
        lower.includes('send') ||
        lower.includes('slack'))
    ) {
      return 'api';
    }
    return 'desktop';
  }
}

export type { ExecutionPlan, PlanStep };
