/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Pause, Square, Maximize2 } from 'lucide-react';

import { useStore } from '@renderer/hooks/useStore';
import { api } from '@renderer/api';
import { PlanStepList } from './PlanStepList';
import { ProgressBar } from './ProgressBar';

export function MissionControlWidget() {
  const plan = useStore((s) => s.orchestratorPlan);
  const activeStep = useStore((s) => s.orchestratorActiveStep);
  const results = useStore((s) => s.orchestratorStepResults);
  const phase = useStore((s) => s.orchestratorPhase);
  const startTime = useStore((s) => s.orchestratorStartTime);

  if (!plan || phase === 'idle') return null;

  const completed = results.filter((r) => r.success).length;
  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

  const activeStepData = plan.find((s) => s.id === activeStep);

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-primary">heyworkly</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => api.pauseRun()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Pause"
          >
            <Pause size={12} />
          </button>
          <button
            onClick={() => api.stopRun()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Stop"
          >
            <Square size={12} />
          </button>
          <button
            onClick={() => api.expandFromWidget()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Expand"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Planning state */}
      {phase === 'planning' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Planning your task...
            </p>
          </div>
        </div>
      )}

      {/* Plan list */}
      {(phase === 'plan-reveal' ||
        phase === 'executing' ||
        phase === 'complete') && (
        <>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <PlanStepList
              steps={plan}
              activeStepId={activeStep}
              results={results}
            />
          </div>

          {/* Footer stats */}
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                Step {activeStep ?? '-'} of {plan.length}
                {activeStepData && ` \u00B7 ${activeStepData.agent} agent`}
              </span>
              <span>{elapsed}s</span>
            </div>
            <ProgressBar completed={completed} total={plan.length} />
          </div>
        </>
      )}
    </div>
  );
}
