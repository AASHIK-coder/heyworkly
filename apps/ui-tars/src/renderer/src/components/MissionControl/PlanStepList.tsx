/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Check, Circle, Loader2, X, Globe, Monitor, Plug } from 'lucide-react';
import { cn } from '@renderer/utils';
import type {
  OrchestratorPlanStep,
  OrchestratorStepResult,
} from '@main/store/types';

interface PlanStepListProps {
  steps: OrchestratorPlanStep[];
  activeStepId: number | null;
  results: OrchestratorStepResult[];
}

const AGENT_ICONS: Record<string, typeof Globe> = {
  browser: Globe,
  desktop: Monitor,
  api: Plug,
};

const AGENT_LABELS: Record<string, string> = {
  browser: 'Browser',
  desktop: 'Desktop',
  api: 'API',
};

export function PlanStepList({
  steps,
  activeStepId,
  results,
}: PlanStepListProps) {
  const resultMap = new Map(results.map((r) => [r.stepId, r]));

  return (
    <div className="space-y-0.5">
      {steps.map((step) => {
        const result = resultMap.get(step.id);
        const isActive = step.id === activeStepId;
        const isDone = result?.success === true;
        const isFailed = result?.success === false;
        const AgentIcon = AGENT_ICONS[step.agent] || Monitor;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
              isActive && 'bg-primary/10',
              isDone && 'opacity-70',
            )}
          >
            {/* Status icon */}
            <div className="mt-0.5 flex-shrink-0">
              {isDone && <Check size={12} className="text-green-500" />}
              {isFailed && <X size={12} className="text-red-500" />}
              {isActive && !result && (
                <Loader2 size={12} className="text-primary animate-spin" />
              )}
              {!isActive && !result && (
                <Circle size={12} className="text-muted-foreground/40" />
              )}
            </div>

            {/* Step text */}
            <span
              className={cn(
                'flex-1 min-w-0 truncate',
                isActive
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {step.id}. {step.task}
            </span>

            {/* Agent badge */}
            <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground/60">
              <AgentIcon size={10} />
              <span className="text-[10px]">{AGENT_LABELS[step.agent]}</span>
            </div>

            {/* Retry badge */}
            {isFailed && result.retries > 0 && (
              <span className="text-[10px] text-amber-500 flex-shrink-0">
                {result.retries}x
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
