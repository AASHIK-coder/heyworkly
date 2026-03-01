/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */

interface ProgressBarProps {
  completed: number;
  total: number;
}

export function ProgressBar({ completed, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}
