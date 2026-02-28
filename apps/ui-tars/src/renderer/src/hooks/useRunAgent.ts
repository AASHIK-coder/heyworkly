/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { toast } from 'sonner';

import { getState } from '@renderer/hooks/useStore';

import { usePermissions } from './usePermissions';
import { useSetting } from './useSetting';
import { api } from '@renderer/api';
import { ConversationWithSoM } from '@/main/shared/types';
import { Message } from '@ui-tars/shared/types';
import { Operator } from '@/main/store/types';

const filterAndTransformWithMap = (
  history: ConversationWithSoM[],
): Message[] => {
  return history
    .map((conv) => {
      if (conv.from === 'human' && conv.value && conv.value !== '<image>') {
        return {
          from: conv.from,
          value: conv.value,
        };
      } else if (conv.from === 'gpt' && conv.predictionParsed?.length) {
        const finished = conv.predictionParsed.find(
          (p) => p.action_type === 'finished' && p.action_inputs?.content,
        );
        if (finished) {
          return {
            from: conv.from,
            value: finished.action_inputs!.content!,
          };
        }

        const callUser = conv.predictionParsed.find(
          (p) => p.action_type === 'call_user' && p.thought,
        );
        if (callUser) {
          return {
            from: conv.from,
            value: callUser.thought!,
          };
        }
        return undefined;
      } else {
        return undefined;
      }
    })
    .filter((msg): msg is Message => msg !== undefined);
};

export const useRunAgent = () => {
  const { settings } = useSetting();
  const { ensurePermissions } = usePermissions();

  const run = async (
    value: string,
    history: ConversationWithSoM[],
    callback: () => void = () => {},
    /** Lightweight attachment metadata for chat display (no heavy content) */
    attachmentsMeta?: Array<{ type: 'image' | 'text'; fileName: string; mimeType: string; content: string }>,
  ) => {
    const operator = settings.operator;
    if (
      (operator === Operator.LocalBrowser || operator === Operator.LocalComputer) &&
      !(ensurePermissions?.accessibility && ensurePermissions?.screenCapture)
    ) {
      const permissionsText = [
        !ensurePermissions?.screenCapture ? 'screenCapture' : '',
        !ensurePermissions?.accessibility ? 'Accessibility' : '',
      ]
        .filter(Boolean)
        .join(' and ');

      toast.warning(
        `Please grant the required permissions(${permissionsText})`,
      );
      return;
    }

    const initialMessages: ConversationWithSoM[] = [
      {
        from: 'human',
        value,
        timing: { start: Date.now(), end: Date.now(), cost: 0 },
        ...(attachmentsMeta && attachmentsMeta.length > 0 ? { attachments: attachmentsMeta } : {}),
      },
    ];
    const currentMessages = getState().messages;

    const sessionHistory = filterAndTransformWithMap(history);

    // Attachments are already stored in main process state (set during upload)
    // No need to send them again — just set instructions, messages, history
    await Promise.all([
      api.setInstructions({ instructions: value }),
      api.setMessages({ messages: [...currentMessages, ...initialMessages] }),
      api.setSessionHistoryMessages({
        messages: sessionHistory,
      }),
    ]);

    await api.runAgent();

    callback();
  };

  const stopAgentRuning = async (callback: () => void = () => {}) => {
    await api.stopRun();
    callback();
  };

  return { run, stopAgentRuning };
};
