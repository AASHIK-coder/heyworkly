/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useRef, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Paperclip, ArrowUp } from 'lucide-react';

import { useSession } from '@renderer/hooks/useSession';
import { Operator } from '@main/store/types';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';
import { DragArea } from '@renderer/components/Common/drag';

const SUGGESTIONS = [
  'Search for flights from NYC to London',
  'Fill out the expense report form',
  'Find the cheapest laptop on Amazon',
  'Send a Slack message to #general',
];

const MultiAgentHome = () => {
  const navigate = useNavigate();
  const { createSession } = useSession();
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const hasVLM = await checkVLMSettings();
    if (!hasVLM) {
      setSettingsOpen(true);
      return;
    }

    const session = await createSession(trimmed.slice(0, 40), {
      operator: Operator.LocalComputer,
    });

    navigate('/local', {
      state: {
        operator: Operator.LocalComputer,
        sessionId: session?.id,
        from: 'home',
        autoRun: true,
        autoRunInstructions: trimmed,
      },
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <DragArea />
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Shimmer glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-2xl px-6">
          {/* Brand */}
          <h1 className="text-5xl font-bold tracking-tight mb-2">
            <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent">
              heyworkly
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            What would you like me to do?
          </p>

          {/* Input area */}
          <div className="w-full relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your task..."
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-card/50 backdrop-blur-sm px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <button
                type="button"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                title="Start task"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestionClick(s)}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-card/30 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <DragArea />
      <LocalSettingsDialog
        isOpen={settingsOpen}
        onSubmit={() => {
          setSettingsOpen(false);
          handleSubmit();
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default MultiAgentHome;
