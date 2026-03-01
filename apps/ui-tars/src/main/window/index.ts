/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserWindow, screen } from 'electron';

import { logger } from '@main/logger';
import * as env from '@main/env';

import { createWindow } from './createWindow';

let mainWindow: BrowserWindow | null = null;
let originalBounds: Electron.Rectangle | null = null;

export function showInactive() {
  if (mainWindow) {
    // eslint-disable-next-line no-unused-expressions
    mainWindow.showInactive();
  }
}

export function show() {
  if (mainWindow) {
    mainWindow.show();
  }
}

export function createMainWindow() {
  mainWindow = createWindow({
    routerPath: '/',
    width: 1200,
    height: 700,
    alwaysOnTop: false,
  });

  mainWindow.on('close', (event) => {
    logger.info('mainWindow closed');
    if (env.isMacOS) {
      event.preventDefault();

      // Black screen on window close in fullscreen mode
      // https://github.com/electron/electron/issues/20263#issuecomment-633179965
      if (mainWindow?.isFullScreen()) {
        mainWindow?.setFullScreen(false);

        mainWindow?.once('leave-full-screen', () => {
          mainWindow?.hide();
        });
      } else {
        mainWindow?.hide();
      }
    } else {
      mainWindow = null;
    }
  });

  return mainWindow;
}

export function setContentProtection(enable: boolean) {
  mainWindow?.setContentProtection(enable);
}

export async function showWindow() {
  mainWindow?.setContentProtection(false);
  mainWindow?.setIgnoreMouseEvents(false);
  mainWindow?.show();
  mainWindow?.restore();
}

export async function hideMainWindow() {
  try {
    mainWindow?.setContentProtection(true);
    mainWindow?.setAlwaysOnTop(true);
    mainWindow?.setFocusable(false);
    mainWindow?.hide();
  } catch (error) {
    logger.error('[hideMainWindow]', error);
  }
}

export async function showMainWindow() {
  try {
    mainWindow?.setContentProtection(false);
    setTimeout(() => {
      mainWindow?.setAlwaysOnTop(false);
    }, 100);
    mainWindow?.setFocusable(true);
    mainWindow?.show();
  } catch (error) {
    logger.error('[showMainWindow]', error);
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export async function transformToWidget() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  // Save current bounds for restore
  originalBounds = mainWindow.getBounds();

  // Shrink to widget size at bottom-right
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setContentProtection(true);
  mainWindow.setBounds(
    {
      x: screenWidth - 400 - 32,
      y: screenHeight - 350 - 32 - 64,
      width: 400,
      height: 350,
    },
    true, // animate
  );
}

export async function expandFromWidget() {
  if (!mainWindow) return;

  if (originalBounds) {
    mainWindow.setBounds(originalBounds, true);
  } else {
    // Fallback to default size
    mainWindow.setBounds({ x: 100, y: 100, width: 1200, height: 700 }, true);
  }

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setContentProtection(false);
  originalBounds = null;
}
