/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useStore } from '@renderer/hooks/useStore';
import { PlanSummary } from './PlanSummary';

export function ResultsView() {
  const plan = useStore((s) => s.orchestratorPlan);
  const results = useStore((s) => s.orchestratorStepResults);
  const startTime = useStore((s) => s.orchestratorStartTime);
  const phase = useStore((s) => s.orchestratorPhase);

  if (phase !== 'complete' || !plan) return null;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <PlanSummary steps={plan} results={results} startTime={startTime} />

      <div className="text-center text-xs text-muted-foreground pt-4">
        Use the chat input below to start a follow-up task.
      </div>
    </div>
  );
}
