/*
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc } from '@ui-tars/electron-ipc/main';
import { StatusEnum, Conversation, Message } from '@ui-tars/shared/types';
import { store } from '@main/store/create';
import { runAgent } from '@main/services/runAgent';
import { showWindow } from '@main/window/index';

import { closeScreenMarker } from '@main/window/ScreenMarker';
import { GUIAgent } from '@ui-tars/sdk';
import { Operator } from '@ui-tars/sdk/core';
import { processFileFromBase64 } from '@main/services/fileProcessor';
import { logger } from '@main/logger';

const t = initIpc.create();

export class GUIAgentManager {
  private static instance: GUIAgentManager;
  private currentAgent: GUIAgent<Operator> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): GUIAgentManager {
    if (!GUIAgentManager.instance) {
      GUIAgentManager.instance = new GUIAgentManager();
    }
    return GUIAgentManager.instance;
  }

  public setAgent(agent: GUIAgent<Operator>) {
    this.currentAgent = agent;
  }

  public getAgent(): GUIAgent<Operator> | null {
    return this.currentAgent;
  }

  public clearAgent() {
    this.currentAgent = null;
  }
}

export const agentRoute = t.router({
  runAgent: t.procedure.input<void>().handle(async () => {
    const { thinking } = store.getState();
    if (thinking) {
      return;
    }

    store.setState({
      abortController: new AbortController(),
      thinking: true,
      errorMsg: null,
    });

    await runAgent(store.setState, store.getState);

    store.setState({ thinking: false });
  }),
  pauseRun: t.procedure.input<void>().handle(async () => {
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.pause();
      store.setState({ thinking: false });
    }
  }),
  resumeRun: t.procedure.input<void>().handle(async () => {
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.resume();
      store.setState({ thinking: false });
    }
  }),
  stopRun: t.procedure.input<void>().handle(async () => {
    const { abortController } = store.getState();
    store.setState({ status: StatusEnum.END, thinking: false });

    showWindow();

    abortController?.abort();
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.resume();
      guiAgent.stop();
    }

    closeScreenMarker();
  }),
  setInstructions: t.procedure
    .input<{ instructions: string }>()
    .handle(async ({ input }) => {
      store.setState({ instructions: input.instructions });
    }),
  setMessages: t.procedure
    .input<{ messages: Conversation[] }>()
    .handle(async ({ input }) => {
      store.setState({ messages: input.messages });
    }),
  setSessionHistoryMessages: t.procedure
    .input<{ messages: Message[] }>()
    .handle(async ({ input }) => {
      store.setState({ sessionHistoryMessages: input.messages });
    }),
  uploadAndProcessFiles: t.procedure
    .input<{ files: Array<{ name: string; base64: string }> }>()
    .handle(async ({ input }) => {
      logger.info(
        `[uploadAndProcessFiles] processing ${input.files.length} files: ${input.files.map((f) => f.name).join(', ')}`,
      );
      try {
        const resultsPerFile = await Promise.all(
          input.files.map((file) =>
            processFileFromBase64(file.name, file.base64),
          ),
        );
        const flat = resultsPerFile.flat();
        logger.info(
          `[uploadAndProcessFiles] processed ${flat.length} results: ${flat.map((f) => `${f.type}:${f.fileName}(${f.content.length}ch)`).join(', ')}`,
        );

        // Store processed files immediately in main state — no round-trip needed
        const existing = store.getState().attachments || [];
        store.setState({ attachments: [...existing, ...flat] });
        logger.info(
          `[uploadAndProcessFiles] stored in state, total attachments: ${existing.length + flat.length}`,
        );

        // Return only metadata to renderer (no heavy base64 content for text files)
        return flat.map((f) => ({
          type: f.type,
          fileName: f.fileName,
          mimeType: f.mimeType,
          // Only include content for images (renderer needs it for preview thumbnails)
          // Text file content stays in main process only
          content: f.type === 'image' ? f.content : '',
        }));
      } catch (err) {
        logger.error('[uploadAndProcessFiles] error:', err);
        throw err;
      }
    }),
  removeAttachment: t.procedure
    .input<{ index: number }>()
    .handle(async ({ input }) => {
      const current = store.getState().attachments || [];
      const updated = current.filter((_, i) => i !== input.index);
      store.setState({ attachments: updated });
      logger.info(
        `[removeAttachment] removed index ${input.index}, remaining: ${updated.length}`,
      );
    }),
  clearAttachments: t.procedure.input<void>().handle(async () => {
    store.setState({ attachments: [] });
    logger.info('[clearAttachments] cleared all attachments');
  }),
  clearHistory: t.procedure.input<void>().handle(async () => {
    store.setState({
      status: StatusEnum.END,
      messages: [],
      sessionHistoryMessages: [],
      thinking: false,
      errorMsg: null,
      instructions: '',
      attachments: [],
    });
  }),
});
