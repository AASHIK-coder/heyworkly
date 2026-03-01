/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portions Copyright 2024-present Bytedance, Inc. All rights reserved.
 * Use of this source code is governed by a MIT license that can be
 * found in https://github.com/web-infra-dev/midscene/blob/main/LICENSE
 *
 */
import { BrowserWindow, screen, app } from 'electron';

import { PredictionParsed, Conversation } from '@ui-tars/shared/types';

import * as env from '@main/env';
import { logger } from '@main/logger';

import { AppUpdater } from '@main/utils/updateApp';
import { setOfMarksOverlays } from '@main/shared/setOfMarks';
import path from 'path';
import MenuBuilder from '../menu';
import { windowManager } from '../services/windowManager';

let appUpdater;

const CURSOR_OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
  #cursor-container {
    position: absolute;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    will-change: left, top;
  }
  .cursor-svg { filter: drop-shadow(0 0 8px rgba(99,102,241,0.6)); }
  .cursor-label {
    position: absolute; top: 28px; left: 20px;
    font: 600 9px/1 'Inter', system-ui, sans-serif;
    color: rgba(99,102,241,0.9); letter-spacing: 0.5px;
    text-shadow: 0 0 4px rgba(99,102,241,0.4);
    white-space: nowrap;
  }
  .ripple {
    position: absolute; top: 50%; left: 50%;
    width: 40px; height: 40px;
    margin: -20px 0 0 -8px;
    border-radius: 50%; border: 2px solid rgba(99,102,241,0.6);
    opacity: 0; transform: scale(0.5);
    pointer-events: none;
  }
  .ripple.active { animation: hw-ripple 0.6s ease-out forwards; }
  @keyframes hw-ripple {
    0% { opacity: 0.8; transform: scale(0.5); }
    100% { opacity: 0; transform: scale(2.5); }
  }
  .action-badge {
    position: absolute; top: -20px; left: 24px;
    font: 500 10px/1 'Inter', system-ui, sans-serif;
    background: rgba(99,102,241,0.9); color: white;
    padding: 3px 8px; border-radius: 4px;
    opacity: 0; transition: opacity 0.2s;
    white-space: nowrap;
  }
  .action-badge.visible { opacity: 1; }
  .thinking-dots {
    position: absolute; top: 50%; left: 50%;
    width: 30px; height: 30px; margin: -15px 0 0 -7px;
  }
  .thinking-dot {
    position: absolute; width: 4px; height: 4px;
    background: rgba(99,102,241,0.8); border-radius: 50%;
  }
  .thinking-dots.active .thinking-dot { animation: hw-orbit 1.2s linear infinite; }
  .thinking-dot:nth-child(1) { animation-delay: 0s; }
  .thinking-dot:nth-child(2) { animation-delay: 0.3s; }
  .thinking-dot:nth-child(3) { animation-delay: 0.6s; }
  @keyframes hw-orbit {
    0% { transform: rotate(0deg) translateX(12px) rotate(0deg); opacity: 1; }
    100% { transform: rotate(360deg) translateX(12px) rotate(-360deg); opacity: 1; }
  }
  #cursor-container.hidden { display: none; }
</style>
</head>
<body>
<div id="cursor-container" class="hidden">
  <svg class="cursor-svg" width="24" height="28" viewBox="0 0 24 28">
    <defs>
      <linearGradient id="ptr" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
    </defs>
    <path d="M2 2 L2 22 L7 17 L12 26 L16 24 L11 15 L18 15 Z"
          fill="url(#ptr)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
  </svg>
  <div class="cursor-label">heyworkly</div>
  <div class="ripple" id="r1"></div>
  <div class="ripple" id="r2"></div>
  <div class="ripple" id="r3"></div>
  <div class="action-badge" id="badge"></div>
  <div class="thinking-dots" id="thinking">
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
  </div>
</div>
<script>
  var el = document.getElementById('cursor-container');
  var badge = document.getElementById('badge');
  var thinking = document.getElementById('thinking');
  function updateCursor(x, y, action) {
    el.classList.remove('hidden');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    badge.classList.remove('visible');
    thinking.classList.remove('active');
    document.querySelectorAll('.ripple').forEach(function(r) { r.classList.remove('active'); });
    if (action === 'click' || action === 'gui_click') {
      setTimeout(function() { document.getElementById('r1').classList.add('active'); }, 0);
      setTimeout(function() { document.getElementById('r2').classList.add('active'); }, 100);
      setTimeout(function() { document.getElementById('r3').classList.add('active'); }, 200);
      setTimeout(function() { document.querySelectorAll('.ripple').forEach(function(r) { r.classList.remove('active'); }); }, 700);
    } else if (action === 'hotkey' || action === 'gui_hotkey') {
      badge.textContent = 'Hotkey';
      badge.classList.add('visible');
      setTimeout(function() { badge.classList.remove('visible'); }, 1500);
    } else if (action === 'thinking') {
      thinking.classList.add('active');
    } else if (action === 'hide') {
      el.classList.add('hidden');
    }
  }
  function hideCursor() { el.classList.add('hidden'); }
</script>
</body>
</html>`;

class ScreenMarker {
  private static instance: ScreenMarker;
  private currentOverlay: BrowserWindow | null = null;
  private widgetWindow: BrowserWindow | null = null;
  private screenWaterFlow: BrowserWindow | null = null;
  private cursorOverlay: BrowserWindow | null = null;
  private lastShowPredictionMarkerPos: { xPos: number; yPos: number } | null =
    null;

  static getInstance(): ScreenMarker {
    if (!ScreenMarker.instance) {
      ScreenMarker.instance = new ScreenMarker();
    }
    return ScreenMarker.instance;
  }

  /**
   * Temporarily hide overlay windows so that synthetic mouse events from nut-js
   * (CGEventPost / SendInput) reach the actual target application instead of
   * being absorbed by alwaysOnTop overlay BrowserWindows.
   */
  hideOverlaysForExecution() {
    try {
      if (this.currentOverlay && !this.currentOverlay.isDestroyed()) {
        this.currentOverlay.hide();
      }
      if (this.screenWaterFlow && !this.screenWaterFlow.isDestroyed()) {
        this.screenWaterFlow.hide();
      }
      if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
        this.cursorOverlay.hide();
      }
    } catch (e) {
      logger.error('[ScreenMarker] hideOverlaysForExecution error:', e);
    }
  }

  /**
   * Restore overlay windows after execute completes.
   */
  restoreOverlaysAfterExecution() {
    try {
      if (this.currentOverlay && !this.currentOverlay.isDestroyed()) {
        this.currentOverlay.showInactive();
      }
      if (this.screenWaterFlow && !this.screenWaterFlow.isDestroyed()) {
        this.screenWaterFlow.showInactive();
      }
      if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
        this.cursorOverlay.showInactive();
      }
    } catch (e) {
      logger.error('[ScreenMarker] restoreOverlaysAfterExecution error:', e);
    }
  }

  showScreenWaterFlow() {
    if (this.screenWaterFlow) {
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.screenWaterFlow = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      thickFrame: false,
      show: false,
      paintWhenInitiallyHidden: true,
      type: 'panel',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    this.screenWaterFlow.setFocusable(false);
    this.screenWaterFlow.setContentProtection(false);
    this.screenWaterFlow.setIgnoreMouseEvents(true);

    if (env.isWindows) {
      this.screenWaterFlow.setAlwaysOnTop(true, 'screen-saver');
    }

    this.screenWaterFlow.once('ready-to-show', () => {
      if (this.screenWaterFlow && !this.screenWaterFlow.isDestroyed()) {
        this.screenWaterFlow.showInactive();
      }
    });

    this.screenWaterFlow.loadURL(`data:text/html;charset=UTF-8,
      <html>
        <head>
          <style id="water-flow-animation">
            html::before {
              content: "";
              position: fixed;
              top: 0; right: 0; bottom: 0; left: 0;
              pointer-events: none;
              z-index: 9999;
              background:
                linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%) left,
                linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%) right,
                linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%) top,
                linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%) bottom;
              background-repeat: no-repeat;
              background-size: 10% 100%, 10% 100%, 100% 10%, 100% 10%;
              animation: waterflow 5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
              filter: blur(8px);
            }

            @keyframes waterflow {
              0%, 100% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%);
                transform: scale(1);
              }
              25% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
                transform: scale(1.03);
              }
              50% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.38), transparent 55%);
                transform: scale(1.05);
              }
              75% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
                transform: scale(1.03);
              }
            }
          </style>
        </head>
        <body></body>
      </html>
    `);
  }

  hideScreenWaterFlow() {
    this.screenWaterFlow?.close();
    this.screenWaterFlow = null;
  }

  hideWidgetWindow() {
    this.widgetWindow?.close();
    this.widgetWindow = null;
  }

  showWidgetWindow() {
    if (this.widgetWindow) {
      this.widgetWindow.close();
      this.widgetWindow = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.widgetWindow = new BrowserWindow({
      width: 400,
      height: 400,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      show: false,
      // 'toolbar' is macOS-only; use 'panel' on Windows/Linux for proper rendering
      type: env.isMacOS ? 'toolbar' : 'panel',
      ...(env.isMacOS && { visualEffectState: 'active' }),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: !!env.isDev,
      },
    });

    this.widgetWindow.setFocusable(false);
    this.widgetWindow.setContentProtection(true); // not show for vlm model
    this.widgetWindow.setPosition(
      Math.floor(screenWidth - 400 - 32),
      Math.floor(screenHeight - 400 - 32 - 64),
    );

    if (env.isWindows) {
      this.widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    this.widgetWindow.once('ready-to-show', () => {
      if (this.widgetWindow && !this.widgetWindow.isDestroyed()) {
        this.widgetWindow.showInactive();
      }
    });

    if (!app.isPackaged && env.rendererUrl) {
      this.widgetWindow.loadURL(env.rendererUrl + '#widget');
    } else {
      this.widgetWindow.loadFile(
        path.join(__dirname, '../renderer/index.html'),
        {
          hash: '#widget',
        },
      );
    }

    if (!appUpdater) {
      appUpdater = new AppUpdater(this.widgetWindow);
    }

    const menuBuilder = new MenuBuilder(this.widgetWindow, appUpdater);
    menuBuilder.buildMenu();

    windowManager.registerWindow(this.widgetWindow);
  }

  // show Screen Marker in screen for prediction
  showPredictionMarker(
    predictions: PredictionParsed[],
    screenshotContext: NonNullable<Conversation['screenshotContext']>,
  ) {
    const { overlays } = setOfMarksOverlays({
      predictions,
      screenshotContext,
      xPos: this.lastShowPredictionMarkerPos?.xPos,
      yPos: this.lastShowPredictionMarkerPos?.yPos,
    });

    const { scaleFactor = 1 } = screenshotContext;

    // loop predictions
    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i];
      // logger.info('[showPredictionMarker] prediction', overlay);

      try {
        this.closeOverlay();

        // overlay.xPos/yPos are in screenshot pixel space (physical pixels on
        // Windows). Electron BrowserWindow x/y expects logical (screen) coords.
        // On macOS scaleFactor=1 so physical===logical.
        // On Windows we must divide by scaleFactor to convert physical→logical.
        let overlayX: number | undefined;
        let overlayY: number | undefined;
        if (overlay.xPos && overlay.yPos) {
          overlayX = Math.floor((overlay.xPos + overlay.offsetX) / scaleFactor);
          overlayY = Math.floor((overlay.yPos + overlay.offsetY) / scaleFactor);
        }

        this.currentOverlay = new BrowserWindow({
          width: overlay.boxWidth || 300,
          height: overlay.boxHeight || 100,
          transparent: true,
          frame: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          hasShadow: false,
          thickFrame: false,
          paintWhenInitiallyHidden: true,
          type: 'panel',
          webPreferences: { nodeIntegration: true, contextIsolation: false },
          ...(overlayX !== undefined &&
            overlayY !== undefined && {
              x: overlayX,
              y: overlayY,
            }),
        });

        this.currentOverlay.blur();
        this.currentOverlay.setFocusable(false);
        this.currentOverlay.setContentProtection(true); // not show for vlm model
        this.currentOverlay.setIgnoreMouseEvents(true, { forward: true });

        if (env.isWindows) {
          this.currentOverlay.setAlwaysOnTop(true, 'screen-saver');
        }

        // 在 Windows 上设置窗口为工具窗口
        // if (process.platform === 'win32') {
        //   this.currentOverlay.setWindowButtonVisibility(false);
        //   const { SetWindowAttributes } = await import('windows-native-registry');
        //   SetWindowAttributes(this.currentOverlay.getNativeWindowHandle(), {
        //     toolWindow: true,
        //   });
        // }

        if (overlay.xPos && overlay.yPos) {
          this.lastShowPredictionMarkerPos = {
            xPos: overlay.xPos,
            yPos: overlay.yPos,
          };
        }

        if (overlay.svg) {
          this.currentOverlay.loadURL(`data:text/html;charset=UTF-8,
    <html>
      <body style="background: transparent; margin: 0;">
        ${overlay.svg}
      </body>
    </html>
    `);

          // max 5s close overlay
          setTimeout(() => {
            this.closeOverlay();
          }, 5000);
        }
      } catch (error) {
        logger.error('[showPredictionMarker] 显示预测标记失败:', error);
      }
    }
  }

  // ── Magic cursor overlay ──

  showCursorOverlay() {
    if (this.cursorOverlay) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.cursorOverlay = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      thickFrame: false,
      show: false,
      paintWhenInitiallyHidden: true,
      type: 'panel',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    this.cursorOverlay.setFocusable(false);
    this.cursorOverlay.setContentProtection(true);
    this.cursorOverlay.setIgnoreMouseEvents(true);

    if (env.isWindows) {
      this.cursorOverlay.setAlwaysOnTop(true, 'screen-saver');
    }

    this.cursorOverlay.once('ready-to-show', () => {
      if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
        this.cursorOverlay.showInactive();
      }
    });

    this.cursorOverlay.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(CURSOR_OVERLAY_HTML)}`,
    );
  }

  hideCursorOverlay() {
    this.cursorOverlay?.close();
    this.cursorOverlay = null;
  }

  updateCursorPosition(x: number, y: number, action: string) {
    if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
      this.cursorOverlay.webContents
        .executeJavaScript(
          `updateCursor(${x}, ${y}, ${JSON.stringify(action)})`,
        )
        .catch(() => {});
    }
  }

  // ── Reactive waterflow glow states ──

  setWaterFlowState(
    state: 'idle' | 'active' | 'step-complete' | 'error' | 'fadeout',
  ) {
    if (!this.screenWaterFlow || this.screenWaterFlow.isDestroyed()) return;

    const colorMap: Record<string, string> = {
      idle: 'rgba(30, 144, 255, 0.4)',
      active: 'rgba(30, 144, 255, 0.7)',
      'step-complete': 'rgba(34, 197, 94, 0.6)',
      error: 'rgba(245, 158, 11, 0.6)',
      fadeout: 'rgba(30, 144, 255, 0)',
    };
    const speedMap: Record<string, string> = {
      idle: '5s',
      active: '2s',
      'step-complete': '5s',
      error: '5s',
      fadeout: '5s',
    };

    const color = colorMap[state] || colorMap.idle;
    const speed = speedMap[state] || speedMap.idle;

    this.screenWaterFlow.webContents
      .executeJavaScript(
        `(function(){
        var style = document.getElementById('water-flow-animation');
        if (style) {
          style.textContent = style.textContent
            .replace(/rgba\\([^)]+\\)/g, '${color}')
            .replace(/animation:[^;]+;/, 'animation: waterflow ${speed} cubic-bezier(0.4, 0, 0.6, 1) infinite;');
        }
      })()`,
      )
      .catch(() => {});

    // For flash states, revert to idle after a brief delay
    if (state === 'step-complete' || state === 'error') {
      setTimeout(() => this.setWaterFlowState('idle'), 1000);
    }
  }

  close() {
    if (this.currentOverlay) {
      this.currentOverlay.close();
      this.currentOverlay = null;
    }
    if (this.widgetWindow) {
      this.widgetWindow.close();
      this.widgetWindow = null;
    }
    if (this.screenWaterFlow) {
      this.screenWaterFlow.close();
      this.screenWaterFlow = null;
    }
    if (this.cursorOverlay) {
      this.cursorOverlay.close();
      this.cursorOverlay = null;
    }
  }

  closeOverlay() {
    if (this.currentOverlay) {
      this.currentOverlay.close();
      this.currentOverlay = null;
    }
  }
}

export const closeScreenMarker = () => {
  ScreenMarker.getInstance().close();
};

export const showPredictionMarker = (
  predictions: PredictionParsed[],
  screenshotContext: NonNullable<Conversation['screenshotContext']>,
) => {
  ScreenMarker.getInstance().showPredictionMarker(
    predictions,
    screenshotContext,
  );
};

export const showWidgetWindow = () => {
  ScreenMarker.getInstance().showWidgetWindow();
};

export const hideWidgetWindow = () => {
  ScreenMarker.getInstance().hideWidgetWindow();
};

export const showScreenWaterFlow = () => {
  ScreenMarker.getInstance().showScreenWaterFlow();
};

export const hideScreenWaterFlow = () => {
  ScreenMarker.getInstance().hideScreenWaterFlow();
};

export const closeOverlay = () => {
  ScreenMarker.getInstance().closeOverlay();
};

export const hideOverlaysForExecution = () => {
  ScreenMarker.getInstance().hideOverlaysForExecution();
};

export const restoreOverlaysAfterExecution = () => {
  ScreenMarker.getInstance().restoreOverlaysAfterExecution();
};

export const showCursorOverlay = () => {
  ScreenMarker.getInstance().showCursorOverlay();
};

export const hideCursorOverlay = () => {
  ScreenMarker.getInstance().hideCursorOverlay();
};

export const updateCursorPosition = (x: number, y: number, action: string) => {
  ScreenMarker.getInstance().updateCursorPosition(x, y, action);
};

export const setWaterFlowState = (
  state: 'idle' | 'active' | 'step-complete' | 'error' | 'fadeout',
) => {
  ScreenMarker.getInstance().setWaterFlowState(state);
};
