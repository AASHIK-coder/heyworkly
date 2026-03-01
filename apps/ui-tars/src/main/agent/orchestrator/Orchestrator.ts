/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolCallingModel, AgentLoop } from '@ui-tars/sdk';
import {
  PlannerAgent,
  type ExecutionPlan,
  type PlanStep,
} from '../planner/PlannerAgent';
import { logger } from '@main/logger';

export type AgentType = 'browser' | 'desktop' | 'api';

export interface OrchestratorAgent {
  type: AgentType;
  loop: AgentLoop;
}

export interface StepResult {
  stepId: number;
  success: boolean;
  result?: string;
  error?: string;
  retries: number;
}

export interface OrchestratorConfig {
  plannerModel: ToolCallingModel;
  agents: Record<AgentType, OrchestratorAgent | null>;
  signal?: AbortSignal;
  maxRetries?: number;
  onStepStart?: (step: PlanStep) => void;
  onStepComplete?: (step: PlanStep, result: StepResult) => void;
  onPlanCreated?: (plan: ExecutionPlan) => void;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private planner: PlannerAgent;
  private stepResults: Map<number, StepResult> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.planner = new PlannerAgent({
      model: config.plannerModel,
      availableAgents: Object.entries(config.agents)
        .filter(([, agent]) => agent !== null)
        .map(([type]) => type),
    });
  }

  async run(instruction: string): Promise<{
    plan: ExecutionPlan;
    results: StepResult[];
    success: boolean;
  }> {
    // Step 1: Create plan
    logger.info('[Orchestrator] Creating plan for:', instruction);
    const plan = await this.planner.createPlan({
      instruction,
      signal: this.config.signal,
    });
    this.config.onPlanCreated?.(plan);
    logger.info('[Orchestrator] Plan created with', plan.plan.length, 'steps');

    // Step 2: Execute steps in dependency order
    const results: StepResult[] = [];
    const completed = new Set<number>();

    while (completed.size < plan.plan.length) {
      if (this.config.signal?.aborted) {
        break;
      }

      // Find steps whose dependencies are all completed
      const ready = plan.plan.filter(
        (step) =>
          !completed.has(step.id) &&
          step.depends_on.every((dep) => completed.has(dep)),
      );

      if (ready.length === 0) {
        logger.error(
          '[Orchestrator] Deadlock — no ready steps but plan not complete',
        );
        break;
      }

      // Execute ready steps (could parallelize independent steps in future)
      for (const step of ready) {
        const result = await this.executeStep(step);
        results.push(result);
        this.stepResults.set(step.id, result);

        if (result.success) {
          completed.add(step.id);
        } else {
          // Recovery: try to continue with remaining steps
          logger.warn(`[Orchestrator] Step ${step.id} failed:`, result.error);
          completed.add(step.id); // Mark as "attempted" to prevent infinite loop
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    return { plan, results, success: allSuccess };
  }

  private async executeStep(step: PlanStep): Promise<StepResult> {
    this.config.onStepStart?.(step);
    const maxRetries = this.config.maxRetries ?? 2;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const agent = this.config.agents[step.agent];
      if (!agent) {
        return {
          stepId: step.id,
          success: false,
          error: `Agent "${step.agent}" not available`,
          retries: attempt,
        };
      }

      try {
        // Build context from previous step results
        const context = this.buildStepContext(step);

        const loopResult = await agent.loop.run({
          systemPrompt: `Execute this subtask: ${step.task}`,
          userMessage: `${step.task}\n\n${context}`,
        });

        const result: StepResult = {
          stepId: step.id,
          success: loopResult.stoppedReason === 'completed',
          result: loopResult.finalText ?? undefined,
          retries: attempt,
        };

        this.config.onStepComplete?.(step, result);

        if (result.success) {
          return result;
        }

        lastError = `Agent loop stopped: ${loopResult.stoppedReason}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        logger.error(
          `[Orchestrator] Step ${step.id} attempt ${attempt + 1} failed:`,
          lastError,
        );
      }
    }

    const failResult: StepResult = {
      stepId: step.id,
      success: false,
      error: lastError,
      retries: maxRetries,
    };
    this.config.onStepComplete?.(step, failResult);
    return failResult;
  }

  private buildStepContext(step: PlanStep): string {
    if (step.depends_on.length === 0) return '';
    const parts: string[] = ['## Previous Step Results'];
    for (const depId of step.depends_on) {
      const dep = this.stepResults.get(depId);
      if (dep?.result) {
        parts.push(`Step ${depId}: ${dep.result}`);
      }
    }
    return parts.join('\n');
  }
}
