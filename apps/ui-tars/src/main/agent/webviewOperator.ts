/*
 * Embedded Browser Operator
 * Controls an Electron <webview> embedded in the main window
 * using Electron's native webContents.debugger API (direct CDP over IPC).
 * This is the most reliable way to control an Electron webview —
 * no WebSocket, no remote debugging port, no session stability issues.
 */
import os from 'os';
import { webContents } from 'electron';
import { Operator, parseBoxToScreenCoords } from '@ui-tars/sdk/core';
import type {
  ScreenshotOutput,
  ExecuteParams,
  ExecuteOutput,
} from '@ui-tars/sdk/core';
import { logger } from '@main/logger';

const isMac = os.platform() === 'darwin';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Allowed URL protocols for navigation ────────────────────────────────────
function isValidNavigationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ── CDP Key Definitions ─────────────────────────────────────────────────────
// Maps human-readable key names → CDP Input.dispatchKeyEvent parameters

interface KeyDef {
  key: string; // DOM Key value
  code: string; // DOM Code value
  keyCode: number; // Windows virtual key code
  isModifier?: boolean; // Whether this is a modifier key
  modifierBit?: number; // CDP modifier bitmask bit (Alt=1, Ctrl=2, Meta=4, Shift=8)
}

const KEY_DEFS: Record<string, KeyDef> = {
  // Modifiers — on macOS ctrl/control maps to Meta (Command)
  shift: {
    key: 'Shift',
    code: 'ShiftLeft',
    keyCode: 16,
    isModifier: true,
    modifierBit: 8,
  },
  alt: {
    key: 'Alt',
    code: 'AltLeft',
    keyCode: 18,
    isModifier: true,
    modifierBit: 1,
  },
  control: {
    key: isMac ? 'Meta' : 'Control',
    code: isMac ? 'MetaLeft' : 'ControlLeft',
    keyCode: isMac ? 91 : 17,
    isModifier: true,
    modifierBit: isMac ? 4 : 2,
  },
  ctrl: {
    key: isMac ? 'Meta' : 'Control',
    code: isMac ? 'MetaLeft' : 'ControlLeft',
    keyCode: isMac ? 91 : 17,
    isModifier: true,
    modifierBit: isMac ? 4 : 2,
  },
  cmd: {
    key: 'Meta',
    code: 'MetaLeft',
    keyCode: 91,
    isModifier: true,
    modifierBit: 4,
  },
  command: {
    key: 'Meta',
    code: 'MetaLeft',
    keyCode: 91,
    isModifier: true,
    modifierBit: 4,
  },
  meta: {
    key: 'Meta',
    code: 'MetaLeft',
    keyCode: 91,
    isModifier: true,
    modifierBit: 4,
  },

  // Navigation / editing
  enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  return: { key: 'Enter', code: 'Enter', keyCode: 13 },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  capslock: { key: 'CapsLock', code: 'CapsLock', keyCode: 20 },

  // Arrows
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },

  // Function keys
  f1: { key: 'F1', code: 'F1', keyCode: 112 },
  f2: { key: 'F2', code: 'F2', keyCode: 113 },
  f3: { key: 'F3', code: 'F3', keyCode: 114 },
  f4: { key: 'F4', code: 'F4', keyCode: 115 },
  f5: { key: 'F5', code: 'F5', keyCode: 116 },
  f6: { key: 'F6', code: 'F6', keyCode: 117 },
  f7: { key: 'F7', code: 'F7', keyCode: 118 },
  f8: { key: 'F8', code: 'F8', keyCode: 119 },
  f9: { key: 'F9', code: 'F9', keyCode: 120 },
  f10: { key: 'F10', code: 'F10', keyCode: 121 },
  f11: { key: 'F11', code: 'F11', keyCode: 122 },
  f12: { key: 'F12', code: 'F12', keyCode: 123 },

  // Letters
  a: { key: 'a', code: 'KeyA', keyCode: 65 },
  b: { key: 'b', code: 'KeyB', keyCode: 66 },
  c: { key: 'c', code: 'KeyC', keyCode: 67 },
  d: { key: 'd', code: 'KeyD', keyCode: 68 },
  e: { key: 'e', code: 'KeyE', keyCode: 69 },
  f: { key: 'f', code: 'KeyF', keyCode: 70 },
  g: { key: 'g', code: 'KeyG', keyCode: 71 },
  h: { key: 'h', code: 'KeyH', keyCode: 72 },
  i: { key: 'i', code: 'KeyI', keyCode: 73 },
  j: { key: 'j', code: 'KeyJ', keyCode: 74 },
  k: { key: 'k', code: 'KeyK', keyCode: 75 },
  l: { key: 'l', code: 'KeyL', keyCode: 76 },
  m: { key: 'm', code: 'KeyM', keyCode: 77 },
  n: { key: 'n', code: 'KeyN', keyCode: 78 },
  o: { key: 'o', code: 'KeyO', keyCode: 79 },
  p: { key: 'p', code: 'KeyP', keyCode: 80 },
  q: { key: 'q', code: 'KeyQ', keyCode: 81 },
  r: { key: 'r', code: 'KeyR', keyCode: 82 },
  s: { key: 's', code: 'KeyS', keyCode: 83 },
  t: { key: 't', code: 'KeyT', keyCode: 84 },
  u: { key: 'u', code: 'KeyU', keyCode: 85 },
  v: { key: 'v', code: 'KeyV', keyCode: 86 },
  w: { key: 'w', code: 'KeyW', keyCode: 87 },
  x: { key: 'x', code: 'KeyX', keyCode: 88 },
  y: { key: 'y', code: 'KeyY', keyCode: 89 },
  z: { key: 'z', code: 'KeyZ', keyCode: 90 },

  // Digits
  '0': { key: '0', code: 'Digit0', keyCode: 48 },
  '1': { key: '1', code: 'Digit1', keyCode: 49 },
  '2': { key: '2', code: 'Digit2', keyCode: 50 },
  '3': { key: '3', code: 'Digit3', keyCode: 51 },
  '4': { key: '4', code: 'Digit4', keyCode: 52 },
  '5': { key: '5', code: 'Digit5', keyCode: 53 },
  '6': { key: '6', code: 'Digit6', keyCode: 54 },
  '7': { key: '7', code: 'Digit7', keyCode: 55 },
  '8': { key: '8', code: 'Digit8', keyCode: 56 },
  '9': { key: '9', code: 'Digit9', keyCode: 57 },

  // Punctuation & symbols
  ',': { key: ',', code: 'Comma', keyCode: 188 },
  comma: { key: ',', code: 'Comma', keyCode: 188 },
  '.': { key: '.', code: 'Period', keyCode: 190 },
  period: { key: '.', code: 'Period', keyCode: 190 },
  '/': { key: '/', code: 'Slash', keyCode: 191 },
  slash: { key: '/', code: 'Slash', keyCode: 191 },
  '\\': { key: '\\', code: 'Backslash', keyCode: 220 },
  backslash: { key: '\\', code: 'Backslash', keyCode: 220 },
  '-': { key: '-', code: 'Minus', keyCode: 189 },
  minus: { key: '-', code: 'Minus', keyCode: 189 },
  '=': { key: '=', code: 'Equal', keyCode: 187 },
  equal: { key: '=', code: 'Equal', keyCode: 187 },
  '[': { key: '[', code: 'BracketLeft', keyCode: 219 },
  ']': { key: ']', code: 'BracketRight', keyCode: 221 },
  ';': { key: ';', code: 'Semicolon', keyCode: 186 },
  semicolon: { key: ';', code: 'Semicolon', keyCode: 186 },
  "'": { key: "'", code: 'Quote', keyCode: 222 },
  quote: { key: "'", code: 'Quote', keyCode: 222 },
  '`': { key: '`', code: 'Backquote', keyCode: 192 },
  backquote: { key: '`', code: 'Backquote', keyCode: 192 },

  // Windows key (maps to Meta on Windows, same as Cmd on Mac)
  win: {
    key: 'Meta',
    code: 'MetaLeft',
    keyCode: 91,
    isModifier: true,
    modifierBit: 4,
  },
};

// macOS shortcut commands — CDP uses the `commands` parameter
// to properly execute macOS system shortcuts
const MAC_SHORTCUT_COMMANDS: Record<string, string> = {
  'Meta+a': 'selectAll',
  'Meta+c': 'copy',
  'Meta+x': 'cut',
  'Meta+v': 'paste',
  'Meta+z': 'undo',
  'Meta+y': 'redo',
  'Meta+Shift+z': 'redo',
};

// ── The Operator ─────────────────────────────────────────────────────────────

// Fixed viewport dimensions for consistent screenshots and coordinate mapping.
// The webview always renders at this resolution regardless of app window size.
export const BROWSER_VIEWPORT_WIDTH = 1280;
export const BROWSER_VIEWPORT_HEIGHT = 720;

export class EmbeddedBrowserOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='')`,
      `type(content='') #If you want to submit your input, use "\\\\n" at the end of \`content\`.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() #Sleep for 5s and take a screenshot to check for any changes.`,
      `finished()`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
    ],
  };

  private wc: Electron.WebContents | null = null;
  private debuggerAttached = false;
  private deviceScaleFactor: number | null = null;

  /**
   * Find the embedded webview's webContents and attach the CDP debugger.
   * Retries up to 10 times with 500ms delay to handle the race condition
   * where connect() is called before the webview DOM element is ready.
   */
  async connect(): Promise<void> {
    logger.info('[EmbeddedBrowserOperator] Finding webview webContents...');

    let webviewWC: Electron.WebContents | undefined;
    const maxRetries = 10;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const allWC = webContents.getAllWebContents();
      logger.info(
        `[EmbeddedBrowserOperator] Attempt ${attempt}/${maxRetries} — webContents count: ${allWC.length}`,
      );

      webviewWC = allWC.find((wc) => wc.getType() === 'webview');
      if (webviewWC) break;

      if (attempt < maxRetries) {
        logger.info(
          '[EmbeddedBrowserOperator] Webview not found yet, retrying...',
        );
        await delay(500);
      }
    }

    if (!webviewWC) {
      throw new Error(
        '[EmbeddedBrowserOperator] No webview found after retries. Make sure the browser panel is loaded.',
      );
    }

    this.wc = webviewWC;

    // Detach any existing debugger before attaching fresh
    try {
      if (this.wc.debugger.isAttached()) {
        this.wc.debugger.detach();
        logger.info(
          '[EmbeddedBrowserOperator] Detached existing debugger before re-attaching',
        );
      }
    } catch {
      // Ignore detach errors
    }

    // Attach the CDP debugger
    try {
      this.wc.debugger.attach('1.3');
      this.debuggerAttached = true;
      logger.info(
        `[EmbeddedBrowserOperator] Debugger attached to webview (id: ${this.wc.id}, url: ${this.wc.getURL()})`,
      );
    } catch (err: any) {
      // Already attached is fine
      if (err.message?.includes('Already attached')) {
        this.debuggerAttached = true;
        logger.info('[EmbeddedBrowserOperator] Debugger was already attached');
      } else {
        throw err;
      }
    }

    // Listen for detach events
    this.wc.debugger.on('detach', (_event, reason) => {
      logger.warn(`[EmbeddedBrowserOperator] Debugger detached: ${reason}`);
      this.debuggerAttached = false;
    });

    // Listen for webContents destruction so ensureAttached can reconnect
    this.wc.on('destroyed', () => {
      logger.warn('[EmbeddedBrowserOperator] WebContents destroyed event');
      this.debuggerAttached = false;
    });

    // Set a fixed viewport so screenshots are always the same size,
    // ensuring consistent coordinate mapping for the AI model.
    await this.cdp('Emulation.setDeviceMetricsOverride', {
      width: BROWSER_VIEWPORT_WIDTH,
      height: BROWSER_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    this.deviceScaleFactor = 1;
    logger.info(
      `[EmbeddedBrowserOperator] Fixed viewport set to ${BROWSER_VIEWPORT_WIDTH}x${BROWSER_VIEWPORT_HEIGHT} @1x`,
    );
  }

  private cdp(method: string, params?: Record<string, any>): Promise<any> {
    if (!this.wc || !this.debuggerAttached) {
      throw new Error('[EmbeddedBrowserOperator] Debugger not connected');
    }
    return this.wc.debugger.sendCommand(method, params);
  }

  private async ensureAttached(): Promise<void> {
    if (this.wc && !this.wc.isDestroyed() && this.debuggerAttached) {
      return; // Everything OK
    }

    // If webContents was destroyed (e.g. webview navigated), try to find a new one
    if (!this.wc || this.wc.isDestroyed()) {
      logger.warn(
        '[EmbeddedBrowserOperator] WebContents destroyed, attempting to reconnect...',
      );
      const allWC = webContents.getAllWebContents();
      const webviewWC = allWC.find(
        (wc) => wc.getType() === 'webview' && !wc.isDestroyed(),
      );
      if (!webviewWC) {
        throw new Error(
          '[EmbeddedBrowserOperator] WebContents destroyed and no webview available',
        );
      }
      this.wc = webviewWC;
      this.debuggerAttached = false;
      logger.info(
        `[EmbeddedBrowserOperator] Found new webview (id: ${this.wc.id})`,
      );
    }

    // Re-attach debugger if needed
    if (!this.debuggerAttached) {
      try {
        if (this.wc.debugger.isAttached()) {
          this.wc.debugger.detach();
        }
      } catch {
        // Ignore detach errors
      }
      try {
        this.wc.debugger.attach('1.3');
        this.debuggerAttached = true;
        logger.info('[EmbeddedBrowserOperator] Re-attached debugger');

        // Re-apply viewport override
        await this.cdp('Emulation.setDeviceMetricsOverride', {
          width: BROWSER_VIEWPORT_WIDTH,
          height: BROWSER_VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
          mobile: false,
        });
        this.deviceScaleFactor = 1;
      } catch {
        throw new Error('[EmbeddedBrowserOperator] Cannot re-attach debugger');
      }
    }
  }

  private async getScaleFactor(): Promise<number> {
    if (this.deviceScaleFactor) return this.deviceScaleFactor;

    try {
      const result = await this.cdp('Runtime.evaluate', {
        expression: 'window.devicePixelRatio',
        returnByValue: true,
      });
      const ratio = result?.result?.value;
      if (typeof ratio === 'number' && ratio > 0) {
        this.deviceScaleFactor = ratio;
        return ratio;
      }
    } catch {
      // fallthrough
    }

    this.deviceScaleFactor = 1;
    return 1;
  }

  // ── Screenshot ──────────────────────────────────────────────────────────

  async screenshot(): Promise<ScreenshotOutput> {
    await this.ensureAttached();
    const scaleFactor = await this.getScaleFactor();

    logger.info('[EmbeddedBrowserOperator] Taking screenshot...');
    const startTime = Date.now();

    const result = await this.cdp('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 75,
    });

    const duration = Date.now() - startTime;
    logger.info(`[EmbeddedBrowserOperator] Screenshot taken in ${duration}ms`);

    return {
      base64: result.data,
      scaleFactor,
    };
  }

  // ── Execute ─────────────────────────────────────────────────────────────

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    await this.ensureAttached();

    const { parsedPrediction, screenWidth, screenHeight } = params;
    const { action_type, action_inputs } = parsedPrediction;
    const startBoxStr = action_inputs?.start_box || '';

    const scaleFactor = await this.getScaleFactor();
    const coords = parseBoxToScreenCoords({
      boxStr: startBoxStr,
      screenWidth,
      screenHeight,
    });
    const startX = coords.x != null ? coords.x / scaleFactor : null;
    const startY = coords.y != null ? coords.y / scaleFactor : null;

    logger.info(`[EmbeddedBrowserOperator] Execute: ${action_type}`, {
      startX,
      startY,
      action_inputs,
    });

    try {
      switch (action_type) {
        case 'click':
        case 'left_click':
        case 'left_single':
          if (startX != null && startY != null)
            await this.mouseClick(startX, startY);
          break;

        case 'double_click':
        case 'left_double':
          if (startX != null && startY != null)
            await this.mouseClick(startX, startY, 'left', 2);
          break;

        case 'right_click':
        case 'right_single':
          if (startX != null && startY != null)
            await this.mouseClick(startX, startY, 'right', 1);
          break;

        case 'type':
          await this.handleType(action_inputs);
          await delay(1000);
          break;

        case 'hotkey':
          await this.handleHotkey(action_inputs);
          break;

        case 'press':
          await this.handleKeyAction(action_inputs, 'down');
          break;

        case 'release':
          await this.handleKeyAction(action_inputs, 'up');
          await delay(500);
          break;

        case 'scroll':
          await this.handleScroll(action_inputs);
          break;

        case 'drag':
          await this.handleDrag(
            action_inputs,
            scaleFactor,
            screenWidth,
            screenHeight,
          );
          break;

        case 'navigate':
          if (action_inputs.content) {
            await this.handleNavigate(action_inputs.content);
          }
          break;

        case 'navigate_back':
          await this.cdp('Runtime.evaluate', {
            expression: 'history.back()',
            awaitPromise: false,
          });
          await delay(1000);
          break;

        case 'wait':
          await delay(5000);
          break;

        case 'finished':
        case 'call_user':
        case 'user_stop':
          break;

        default:
          logger.warn(
            `[EmbeddedBrowserOperator] Unsupported action: ${action_type}`,
          );
      }

      logger.info(`[EmbeddedBrowserOperator] Action ${action_type} completed`);
    } catch (error) {
      logger.error(
        `[EmbeddedBrowserOperator] Failed to execute ${action_type}:`,
        error,
      );
      throw error;
    }

    return {
      // @ts-expect-error matches BrowserOperator return shape
      startX,
      startY,
      action_inputs,
    };
  }

  // ── Mouse Operations (via CDP Input.dispatchMouseEvent) ────────────────

  private async mouseMove(x: number, y: number) {
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      clickCount: 0,
    });
  }

  private async mouseClick(
    x: number,
    y: number,
    button = 'left',
    clickCount = 1,
  ) {
    await this.mouseMove(x, y);
    await delay(100);

    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount,
    });
    await delay(50);
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount,
    });
    await delay(800);
  }

  // ── Text Input ────────────────────────────────────────────────────────

  private async handleType(inputs: Record<string, any>) {
    const content = inputs.content?.trim();
    if (!content) return;

    const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');

    // Use Input.insertText for reliable text insertion
    await this.cdp('Input.insertText', { text: stripContent });

    if (content.endsWith('\n') || content.endsWith('\\n')) {
      await delay(50);
      await this.keyTap(KEY_DEFS['enter']);
      await delay(2000); // Wait for possible navigation
    }
  }

  // ── Hotkey Operations ─────────────────────────────────────────────────

  private async handleHotkey(inputs: Record<string, any>) {
    const keyStr = inputs?.key || inputs?.hotkey;
    if (!keyStr) return;

    // Normalize multi-word key names like "page down" → "pagedown"
    // before splitting on spaces (which are also the key separator).
    const normalized = keyStr
      .replace(/\bpage\s+down\b/gi, 'pagedown')
      .replace(/\bpage\s+up\b/gi, 'pageup')
      .replace(/\bcaps\s*lock\b/gi, 'capslock')
      .replace(/\bscroll\s*lock\b/gi, 'scrolllock')
      .replace(/\bnum\s*lock\b/gi, 'numlock')
      .replace(/\bprint\s*screen\b/gi, 'printscreen')
      .replace(/\bcontext\s*menu\b/gi, 'contextmenu');

    const keys = normalized.split(/[\s+]+/).filter(Boolean);
    const defs: KeyDef[] = [];
    for (const key of keys) {
      const def = KEY_DEFS[key.toLowerCase()];
      if (!def) {
        // Log warning instead of throwing — unknown keys should not crash the agent loop
        logger.warn(
          `[EmbeddedBrowserOperator] Unsupported key: "${key}", skipping`,
        );
        continue;
      }
      defs.push(def);
    }

    if (defs.length === 0) {
      logger.warn(
        `[EmbeddedBrowserOperator] No valid keys found in hotkey: "${keyStr}"`,
      );
      return;
    }

    if (defs.length === 1) {
      await this.keyTap(defs[0]);
    } else {
      // Multi-key shortcut
      const modifiers = defs.filter((d) => d.isModifier);
      const nonModifiers = defs.filter((d) => !d.isModifier);
      const modifierBits = modifiers.reduce(
        (acc, m) => acc | (m.modifierBit || 0),
        0,
      );

      // Check for macOS shortcut command
      const shortcutKey = defs.map((d) => d.key).join('+');
      const macCommand = isMac ? MAC_SHORTCUT_COMMANDS[shortcutKey] : undefined;

      // Press modifiers
      for (const mod of modifiers) {
        await this.cdp('Input.dispatchKeyEvent', {
          type: 'rawKeyDown',
          key: mod.key,
          code: mod.code,
          windowsVirtualKeyCode: mod.keyCode,
          modifiers: modifierBits,
        });
      }

      // Press+release non-modifier keys
      for (const k of nonModifiers) {
        const eventParams: Record<string, any> = {
          type: 'rawKeyDown',
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.keyCode,
          modifiers: modifierBits,
        };
        if (macCommand) {
          eventParams.commands = [macCommand];
        }
        await this.cdp('Input.dispatchKeyEvent', eventParams);
        await delay(50);
        await this.cdp('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.keyCode,
          modifiers: modifierBits,
        });
      }

      // Release modifiers (reverse order)
      for (const mod of [...modifiers].reverse()) {
        await this.cdp('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: mod.key,
          code: mod.code,
          windowsVirtualKeyCode: mod.keyCode,
          modifiers: 0,
        });
      }
    }

    await delay(500);
  }

  private async handleKeyAction(
    inputs: Record<string, any>,
    direction: 'down' | 'up',
  ) {
    const keyStr = inputs?.key;
    if (!keyStr) return;

    const keys = keyStr.split(/[\s+]+/).filter(Boolean);
    for (const key of keys) {
      const def = KEY_DEFS[key.toLowerCase()];
      if (!def) {
        logger.warn(
          `[EmbeddedBrowserOperator] Unsupported key in ${direction}: "${key}", skipping`,
        );
        continue;
      }
      await this.cdp('Input.dispatchKeyEvent', {
        type: direction === 'down' ? 'rawKeyDown' : 'keyUp',
        key: def.key,
        code: def.code,
        windowsVirtualKeyCode: def.keyCode,
      });
      await delay(50);
    }
  }

  private async keyTap(def: KeyDef) {
    await this.cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
    });
    await delay(50);
    await this.cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
    });
  }

  // ── Scroll ────────────────────────────────────────────────────────────

  private async handleScroll(inputs: Record<string, any>) {
    const { direction } = inputs;
    const scrollAmount = 500;

    // We need a position for the wheel event; use viewport center
    const metrics = await this.cdp('Page.getLayoutMetrics');
    const cx = (metrics.cssLayoutViewport?.clientWidth || 800) / 2;
    const cy = (metrics.cssLayoutViewport?.clientHeight || 600) / 2;

    let deltaX = 0;
    let deltaY = 0;

    switch (direction?.toLowerCase()) {
      case 'up':
        deltaY = -scrollAmount;
        break;
      case 'down':
        deltaY = scrollAmount;
        break;
      case 'left':
        deltaX = -scrollAmount;
        break;
      case 'right':
        deltaX = scrollAmount;
        break;
      default:
        logger.warn(
          `[EmbeddedBrowserOperator] Unsupported scroll direction: ${direction}`,
        );
        return;
    }

    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: cx,
      y: cy,
      deltaX,
      deltaY,
    });
    await delay(500);
  }

  // ── Navigate ──────────────────────────────────────────────────────────

  private async handleNavigate(rawUrl: string) {
    let url = rawUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (!isValidNavigationUrl(url)) {
      logger.warn(
        `[EmbeddedBrowserOperator] Blocked navigation to unsafe URL: ${url}`,
      );
      return;
    }

    logger.info(`[EmbeddedBrowserOperator] Navigating to: ${url}`);
    await this.cdp('Page.navigate', { url });
    await delay(2000);
  }

  // ── Drag ──────────────────────────────────────────────────────────────

  private async handleDrag(
    inputs: Record<string, any>,
    scaleFactor: number,
    screenWidth: number,
    screenHeight: number,
  ) {
    const startBoxStr = inputs.start_box || '';
    const endBoxStr = inputs.end_box || '';

    if (!startBoxStr || !endBoxStr) return;

    const startCoords = parseBoxToScreenCoords({
      boxStr: startBoxStr,
      screenWidth,
      screenHeight,
    });
    const endCoords = parseBoxToScreenCoords({
      boxStr: endBoxStr,
      screenWidth,
      screenHeight,
    });

    const sx = startCoords.x != null ? startCoords.x / scaleFactor : null;
    const sy = startCoords.y != null ? startCoords.y / scaleFactor : null;
    const ex = endCoords.x != null ? endCoords.x / scaleFactor : null;
    const ey = endCoords.y != null ? endCoords.y / scaleFactor : null;

    if (sx == null || sy == null || ex == null || ey == null) return;

    await this.mouseMove(sx, sy);
    await delay(100);

    // Mouse down
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: sx,
      y: sy,
      button: 'left',
      clickCount: 1,
    });

    // Drag in steps
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const stepX = sx + ((ex - sx) * i) / steps;
      const stepY = sy + ((ey - sy) * i) / steps;
      await this.mouseMove(stepX, stepY);
      await delay(30);
    }

    await delay(100);

    // Mouse up
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: ex,
      y: ey,
      button: 'left',
      clickCount: 1,
    });
    await delay(800);
  }
}
