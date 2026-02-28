/*
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Key, keyboard } from '@computer-use/nut-js';
import {
  type ScreenshotOutput,
  type ExecuteParams,
  type ExecuteOutput,
} from '@ui-tars/sdk/core';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { clipboard } from 'electron';
import { desktopCapturer } from 'electron';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { sleep } from '@ui-tars/shared/utils';
import { getScreenSize } from '@main/utils/screen';
import {
  hideOverlaysForExecution,
  restoreOverlaysAfterExecution,
} from '@main/window/ScreenMarker';

export class NutJSElectronOperator extends NutJSOperator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='')`,
      `type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() #Sleep for 5s and take a screenshot to check for any changes.`,
      `finished()`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
    ],
  };

  public async screenshot(): Promise<ScreenshotOutput> {
    const {
      physicalSize,
      logicalSize,
      scaleFactor,
      id: primaryDisplayId,
    } = getScreenSize(); // Logical = Physical / scaleX

    logger.info(
      '[screenshot] [primaryDisplay]',
      'logicalSize:',
      logicalSize,
      'scaleFactor:',
      scaleFactor,
    );

    // Hide overlays so the VLM sees a clean screenshot without the
    // water-flow border or prediction markers
    hideOverlaysForExecution();
    await sleep(50);

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(logicalSize.width),
          height: Math.round(logicalSize.height),
        },
      });
      const primarySource =
        sources.find(
          (source) => source.display_id === primaryDisplayId.toString(),
        ) || sources[0];

      if (!primarySource) {
        logger.error('[screenshot] Primary display source not found', {
          primaryDisplayId,
          availableSources: sources.map((s) => s.display_id),
        });
        // fallback to default screenshot
        return await super.screenshot();
      }

      const screenshot = primarySource.thumbnail;

      const resized = screenshot.resize({
        width: physicalSize.width,
        height: physicalSize.height,
      });

      return {
        base64: resized.toJPEG(75).toString('base64'),
        scaleFactor,
      };
    } finally {
      restoreOverlaysAfterExecution();
    }
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    // Skip overlay manipulation for non-interactive actions
    const needsOverlayHide = ![
      'finished',
      'call_user',
      'error_env',
      'user_stop',
      'wait',
    ].includes(action_type);

    // Hide alwaysOnTop overlay windows before executing mouse/keyboard actions.
    // On macOS, synthetic events from CGEventPost (used by nut-js / libnut) are
    // delivered to the frontmost window at the target coordinates.  The prediction
    // marker and screen-water-flow overlays are alwaysOnTop, so they absorb the
    // click instead of the actual target application.  Hiding them ensures the
    // underlying app receives the event.
    if (needsOverlayHide) {
      hideOverlaysForExecution();
      await sleep(50); // allow the window server to process the hide
    }

    try {
      if (action_type === 'type' && env.isWindows && action_inputs?.content) {
        const content = action_inputs.content?.trim();

        logger.info('[device] type', content);
        const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
        const originalClipboard = clipboard.readText();
        clipboard.writeText(stripContent);
        await keyboard.pressKey(Key.LeftControl, Key.V);
        await sleep(50);
        await keyboard.releaseKey(Key.LeftControl, Key.V);
        await sleep(50);
        clipboard.writeText(originalClipboard);
      } else {
        return await super.execute(params);
      }
    } finally {
      if (needsOverlayHide) {
        await sleep(100); // allow the action to land before restoring overlays
        restoreOverlaysAfterExecution();
      }
    }
  }
}
