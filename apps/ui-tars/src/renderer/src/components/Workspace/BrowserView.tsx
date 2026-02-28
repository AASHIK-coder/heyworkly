import React, { useMemo, useRef, useEffect, useState } from 'react';
import { BrowserShell } from './BrowserShell';
import { MouseCursor } from './MouseCursor';
import { EmbeddedBrowser } from './EmbeddedBrowser';
import { type ConversationWithSoM } from '@main/shared/types';
import { type PredictionParsed, type Coords } from '@ui-tars/shared/types';
import { ActionIconMap } from '@renderer/const/actions';
import {
  MousePointerClick,
  Brain,
  Eye,
  Loader,
  Image,
} from 'lucide-react';

interface BrowserViewProps {
  messages: ConversationWithSoM[];
  currentIndex: number;
  isRunning?: boolean;
  showLive?: boolean;
  sessionId?: string;
}

function getActionString(parsed: PredictionParsed): string {
  const parts: string[] = [parsed.action_type];
  if (parsed.action_inputs?.start_box) {
    parts.push(`(${parsed.action_inputs.start_box})`);
  }
  if (parsed.action_inputs?.content) {
    parts.push(`"${parsed.action_inputs.content}"`);
  }
  if (parsed.action_inputs?.key) {
    parts.push(`[${parsed.action_inputs.key}]`);
  }
  return parts.join(' ');
}

function extractMousePosition(
  parsed: PredictionParsed | undefined,
  screenSize: { width: number; height: number } | undefined,
): { x: number; y: number } | null {
  if (!parsed || !screenSize) return null;

  const coords = parsed.action_inputs?.start_coords as Coords | undefined;
  if (coords && coords.length === 2) {
    const [x, y] = coords;
    return {
      x: (x / screenSize.width) * 100,
      y: (y / screenSize.height) * 100,
    };
  }

  const box = parsed.action_inputs?.start_box;
  if (box) {
    const nums = box.match(/[\d.]+/g);
    if (nums && nums.length >= 2) {
      return {
        x: parseFloat(nums[0]) / 10,
        y: parseFloat(nums[1]) / 10,
      };
    }
  }

  return null;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  messages,
  currentIndex,
  isRunning = false,
  showLive = true,
  sessionId,
}) => {
  const prevMousePos = useRef<{ x: number; y: number } | null>(null);
  const [imageKey, setImageKey] = useState(0);

  const imageEntries = useMemo(() => {
    return messages
      .map((msg, index) => ({
        originalIndex: index,
        message: msg,
        imageData: msg.screenshotBase64 || msg.screenshotBase64WithElementMarker,
      }))
      .filter((entry) => entry.imageData);
  }, [messages]);

  const currentEntry = imageEntries[currentIndex];

  useEffect(() => {
    setImageKey((k) => k + 1);
  }, [currentIndex, currentEntry?.imageData]);

  const latestMsg = messages[messages.length - 1];
  const latestParsed = latestMsg?.predictionParsed?.[0];
  const latestScreenSize = latestMsg?.screenshotContext?.size;
  const liveMousePos = extractMousePosition(latestParsed, latestScreenSize);

  const replayParsed = currentEntry?.message?.predictionParsed?.[0];
  const replayScreenSize = currentEntry?.message?.screenshotContext?.size;
  const replayMousePos = extractMousePosition(replayParsed, replayScreenSize);

  const activeMousePos = showLive ? liveMousePos : replayMousePos;
  const prevPos = prevMousePos.current;

  useEffect(() => {
    if (activeMousePos) {
      prevMousePos.current = activeMousePos;
    }
  }, [activeMousePos]);

  const activeParsed = showLive ? latestParsed : replayParsed;
  const thought = activeParsed?.thought || '';
  const reflection = activeParsed?.reflection || '';
  const actionType = activeParsed?.action_type || '';
  const actionStr = activeParsed ? getActionString(activeParsed) : '';
  const ActionIcon = ActionIconMap[actionType] || MousePointerClick;
  const isFinished = actionType === 'finished';
  const isError = actionType === 'error_env';

  // Live mode — browser fills ALL space, action panel floats on top
  if (showLive) {
    return (
      <div className="relative h-full">
        {/* Browser fills entire container */}
        <BrowserShell isLive={isRunning} className="h-full">
          <EmbeddedBrowser
            startUrl="https://www.google.com"
            mousePosition={liveMousePos}
            previousMousePosition={prevPos}
            actionType={actionType}
            isRunning={isRunning}
            sessionId={sessionId}
          />
        </BrowserShell>

        {/* Action panel overlays bottom — does NOT affect browser size */}
        {(thought || actionStr) && (
          <div className="absolute bottom-2 left-2 right-2 z-40">
            <ActionPanel
              thought={thought}
              reflection={reflection}
              actionType={actionType}
              actionStr={actionStr}
              ActionIcon={ActionIcon}
              isFinished={isFinished}
              isError={isError}
              isRunning={isRunning}
            />
          </div>
        )}
      </div>
    );
  }

  // Replay mode
  if (!currentEntry) {
    return (
      <BrowserShell>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 py-16">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-violet-900/20 flex items-center justify-center shadow-inner ring-1 ring-blue-100 dark:ring-blue-800/30">
            <Image className="text-blue-500 dark:text-blue-400" size={32} />
          </div>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">
              No screenshots yet
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              Screenshots will appear here as the agent runs
            </p>
          </div>
        </div>
      </BrowserShell>
    );
  }

  const msg = currentEntry.message;
  const mime = msg.screenshotContext?.mime || 'image/png';

  return (
    <div className="flex flex-col gap-3 py-1">
      <BrowserShell>
        <div className="relative overflow-hidden">
          <img
            key={imageKey}
            src={`data:${mime};base64,${currentEntry.imageData}`}
            alt={`Browser step ${currentIndex + 1}`}
            className="w-full h-auto object-contain block animate-screenshot-in"
          />

          {replayMousePos && (
            <MouseCursor
              position={replayMousePos}
              previousPosition={prevPos}
              action={actionType}
            />
          )}
        </div>
      </BrowserShell>

      {(thought || actionStr) && (
        <ActionPanel
          thought={thought}
          reflection={reflection}
          actionType={actionType}
          actionStr={actionStr}
          ActionIcon={ActionIcon}
          isFinished={isFinished}
          isError={isError}
          isRunning={false}
        />
      )}
    </div>
  );
};

/** Floating action/thought panel */
const ActionPanel: React.FC<{
  thought: string;
  reflection: string;
  actionType: string;
  actionStr: string;
  ActionIcon: React.FC<{ size: number }>;
  isFinished: boolean;
  isError: boolean;
  isRunning: boolean;
}> = ({ thought, reflection, actionType, actionStr, ActionIcon, isFinished, isError, isRunning }) => (
  <div className="rounded-xl border border-gray-200/70 dark:border-gray-700/40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg overflow-hidden">
    <div className="flex items-center gap-2.5 px-4 py-2 bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/40">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 ${
        isFinished
          ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-emerald-200/50 dark:ring-emerald-700/50 text-emerald-600 dark:text-emerald-400'
          : isError
            ? 'bg-rose-50 dark:bg-rose-900/30 ring-rose-200/50 dark:ring-rose-700/50 text-rose-600 dark:text-rose-400'
            : 'bg-blue-50 dark:bg-blue-900/30 ring-blue-200/50 dark:ring-blue-700/50 text-blue-600 dark:text-blue-400'
      }`}>
        <ActionIcon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {actionType || 'Processing'}
          </span>
          {isFinished && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">Done</span>
          )}
          {isError && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-medium">Error</span>
          )}
          {isRunning && !isFinished && !isError && (
            <Loader size={10} className="animate-spin text-blue-400" />
          )}
        </div>
        {actionStr && actionType !== 'finished' && (
          <p className="text-[10px] font-mono text-muted-foreground/70 truncate mt-0.5">
            {actionStr}
          </p>
        )}
      </div>
    </div>

    <div className="px-4 py-2 space-y-1.5">
      {thought && (
        <div className="flex gap-2.5">
          <div className="w-4 h-4 rounded flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 flex-shrink-0 mt-0.5">
            <Brain size={10} className="text-blue-500 dark:text-blue-400" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
            {thought}
          </p>
        </div>
      )}
      {reflection && reflection !== thought && (
        <div className="flex gap-2.5">
          <div className="w-4 h-4 rounded flex items-center justify-center bg-violet-50 dark:bg-violet-900/20 flex-shrink-0 mt-0.5">
            <Eye size={10} className="text-violet-500 dark:text-violet-400" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic line-clamp-2">
            {reflection}
          </p>
        </div>
      )}
    </div>
  </div>
);
