import React, { useMemo, useRef, useEffect } from 'react';
import { MousePointerClick, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { type ConversationWithSoM } from '@main/shared/types';
import { ActionIconMap } from '@renderer/const/actions';
import ms from 'ms';

interface StepsTimelineProps {
  messages: ConversationWithSoM[];
  currentIndex: number;
  onStepClick: (index: number) => void;
}

interface StepEntry {
  imageIndex: number;
  originalIndex: number;
  thought: string;
  reflection: string | null;
  actionType: string;
  actionDetails: string;
  cost?: number;
  status: 'success' | 'failed' | 'running' | 'pending';
}

export const StepsTimeline: React.FC<StepsTimelineProps> = ({
  messages,
  currentIndex,
  onStepClick,
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  const steps = useMemo(() => {
    const result: StepEntry[] = [];
    let imageIdx = 0;

    messages.forEach((msg, originalIndex) => {
      const hasImage = !!(msg.screenshotBase64 || msg.screenshotBase64WithElementMarker);

      if (msg.from === 'gpt' && msg.predictionParsed?.length) {
        const firstParsed = msg.predictionParsed[0];

        let actionDetails = firstParsed.action_type;
        if (firstParsed.action_inputs?.start_box) {
          actionDetails += ` (${firstParsed.action_inputs.start_box})`;
        }
        if (firstParsed.action_inputs?.content) {
          actionDetails += ` "${firstParsed.action_inputs.content}"`;
        }
        if (firstParsed.action_inputs?.key) {
          actionDetails += ` [${firstParsed.action_inputs.key}]`;
        }

        const isFinished = firstParsed.action_type === 'finished';
        const isError = firstParsed.action_type === 'error_env';

        result.push({
          imageIndex: hasImage ? imageIdx : -1,
          originalIndex,
          thought: firstParsed.thought || '',
          reflection: firstParsed.reflection || null,
          actionType: firstParsed.action_type,
          actionDetails,
          cost: msg.timing?.cost,
          status: isFinished ? 'success' : isError ? 'failed' : 'success',
        });
      }

      if (hasImage) {
        imageIdx++;
      }
    });

    return result;
  }, [messages]);

  // Auto-scroll to active step
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-280px)] gap-2">
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ArrowRight className="text-gray-400" size={20} />
        </div>
        <p className="text-sm text-muted-foreground">No steps recorded yet</p>
        <p className="text-xs text-muted-foreground/60">Agent actions will appear here</p>
      </div>
    );
  }

  return (
    <div className="py-2 overflow-y-auto max-h-[calc(100vh-240px)]">
      <div className="space-y-1.5 px-1">
        {steps.map((step, idx) => {
          const ActionIcon = ActionIconMap[step.actionType] || MousePointerClick;
          const isActive = step.imageIndex === currentIndex;
          const isClickable = step.imageIndex >= 0;
          const isLast = idx === steps.length - 1;
          const isFinished = step.actionType === 'finished';
          const isError = step.status === 'failed';

          return (
            <button
              key={idx}
              ref={isActive ? activeRef : undefined}
              onClick={() => isClickable && onStepClick(step.imageIndex)}
              disabled={!isClickable}
              className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all duration-200 group relative
                ${isActive
                  ? 'bg-gradient-to-r from-blue-50/90 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/10 border border-blue-200/60 dark:border-blue-700/40 shadow-sm'
                  : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40 border border-transparent'
                }
                ${!isClickable ? 'opacity-50 cursor-default' : 'cursor-pointer'}
              `}
            >
              {/* Step icon with connector line */}
              <div className="relative flex-shrink-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ring-1 transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 ring-blue-300 dark:ring-blue-600 text-white shadow-blue-200/50 dark:shadow-blue-800/30'
                      : isFinished
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-emerald-200 dark:ring-emerald-700 text-emerald-600 dark:text-emerald-400'
                        : isError
                          ? 'bg-rose-50 dark:bg-rose-900/30 ring-rose-200 dark:ring-rose-700 text-rose-600 dark:text-rose-400'
                          : 'bg-white dark:bg-gray-800 ring-gray-200 dark:ring-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <ActionIcon size={15} />
                </div>
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute top-9 left-1/2 -translate-x-1/2 w-px h-4 bg-gray-200 dark:bg-gray-700" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  {/* Step number */}
                  <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums">
                    #{idx + 1}
                  </span>
                  {/* Action type */}
                  <span
                    className={`text-xs font-semibold ${
                      isActive
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {step.actionType}
                  </span>
                  {/* Status badge */}
                  {isFinished && (
                    <CheckCircle size={12} className="text-emerald-500" />
                  )}
                  {isError && (
                    <XCircle size={12} className="text-rose-500" />
                  )}
                  {/* Timing */}
                  {step.cost && (
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 ml-auto">
                      <Clock size={9} />
                      {ms(step.cost)}
                    </span>
                  )}
                </div>

                {/* Thought */}
                {step.thought && (
                  <p className={`text-xs leading-relaxed line-clamp-2 ${
                    isActive
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-muted-foreground'
                  }`}>
                    {step.thought}
                  </p>
                )}

                {/* Action details */}
                <p className="text-[10px] font-mono text-muted-foreground/50 mt-1 truncate">
                  {step.actionDetails}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
