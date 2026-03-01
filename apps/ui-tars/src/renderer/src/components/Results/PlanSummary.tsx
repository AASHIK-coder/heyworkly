/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Check, X, Globe, Monitor, Plug } from 'lucide-react';
import { cn } from '@renderer/utils';
import type {
  OrchestratorPlanStep,
  OrchestratorStepResult,
} from '@main/store/types';

interface PlanSummaryProps {
  steps: OrchestratorPlanStep[];
  results: OrchestratorStepResult[];
  startTime: number | null;
}

const AGENT_ICON: Record<string, typeof Globe> = {
  browser: Globe,
  desktop: Monitor,
  api: Plug,
};

export function PlanSummary({ steps, results, startTime }: PlanSummaryProps) {
  const resultMap = new Map(results.map((r) => [r.stepId, r]));
  const totalTime = startTime
    ? ((Date.now() - startTime) / 1000).toFixed(1)
    : '?';
  const agentTypes = new Set(steps.map((s) => s.agent));
  const allSuccess = results.length > 0 && results.every((r) => r.success);

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium',
          allSuccess
            ? 'bg-green-500/10 text-green-500'
            : 'bg-amber-500/10 text-amber-500',
        )}
      >
        {allSuccess ? <Check size={16} /> : <X size={16} />}
        {allSuccess ? 'Task Complete' : 'Task Partially Complete'}
        <span className="text-muted-foreground font-normal ml-auto">
          {steps.length} steps &middot; {totalTime}s &middot; {agentTypes.size}{' '}
          agent
          {agentTypes.size > 1 ? 's' : ''}
        </span>
      </div>

      {/* Step list */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {steps.map((step) => {
          const result = resultMap.get(step.id);
          const Icon = AGENT_ICON[step.agent] || Monitor;
          const elapsed =
            result?.startTime && result?.endTime
              ? ((result.endTime - result.startTime) / 1000).toFixed(1)
              : '-';

          return (
            <div
              key={step.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              {result?.success ? (
                <Check size={14} className="text-green-500 flex-shrink-0" />
              ) : result?.success === false ? (
                <X size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-foreground">
                {step.id}. {step.task}
              </span>
              <Icon size={12} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {elapsed}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
