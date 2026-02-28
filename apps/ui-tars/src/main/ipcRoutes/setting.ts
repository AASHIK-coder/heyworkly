/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { OpenAI } from 'openai';
import { initIpc } from '@ui-tars/electron-ipc/main';
import { logger } from '../logger';
import { store } from '@main/store/create';

const t = initIpc.create();

export const settingRoute = t.router({
  setTheme: t.procedure
    .input<{ theme: 'dark' | 'light' }>()
    .handle(async ({ input }) => {
      store.setState({ theme: input.theme });
      logger.info(`[setTheme] switched to ${input.theme}`);
    }),
  checkVLMResponseApiSupport: t.procedure
    .input<{
      baseUrl: string;
      apiKey: string;
      modelName: string;
    }>()
    .handle(async ({ input }) => {
      try {
        const openai = new OpenAI({
          apiKey: input.apiKey,
          baseURL: input.baseUrl,
        });
        const result = await openai.responses.create({
          model: input.modelName,
          input: 'return 1+1=?',
          stream: false,
        });
        console.log('result', result);
        return Boolean(result?.id || result?.previous_response_id);
      } catch (e) {
        logger.warn('[checkVLMResponseApiSupport] failed:', e);
        return false;
      }
    }),
  checkModelAvailability: t.procedure
    .input<{
      baseUrl: string;
      apiKey: string;
      modelName: string;
    }>()
    .handle(async ({ input }) => {
      try {
        const openai = new OpenAI({
          apiKey: input.apiKey,
          baseURL: input.baseUrl,
        });
        const completion = await openai.chat.completions.create({
          model: input.modelName,
          messages: [{ role: 'user', content: 'return 1+1=?' }],
          stream: false,
        });
        console.log('result', completion);

        return Boolean(completion?.id || completion.choices[0].message.content);
      } catch (e) {
        throw e;
      }
    }),
});
