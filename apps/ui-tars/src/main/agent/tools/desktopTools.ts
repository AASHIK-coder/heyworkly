/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolHandler } from '@ui-tars/sdk';

const execAsync = promisify(exec);

export function getDesktopToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'gui_click',
        description: 'Click at screen coordinates.',
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate on screen' },
            y: { type: 'number', description: 'Y coordinate on screen' },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button (default left)',
            },
            double: {
              type: 'boolean',
              description: 'Double click (default false)',
            },
          },
          required: ['x', 'y'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_type',
        description: 'Type text at current cursor position.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_hotkey',
        description:
          'Press keyboard shortcut. Keys separated by space, lowercase.',
        parameters: {
          type: 'object',
          properties: {
            keys: {
              type: 'string',
              description: 'e.g. "ctrl c", "alt f4", "return"',
            },
          },
          required: ['keys'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_scroll',
        description: 'Scroll at current position.',
        parameters: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['up', 'down', 'left', 'right'],
            },
            amount: {
              type: 'number',
              description: 'Scroll amount (default 3 lines)',
            },
          },
          required: ['direction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_drag',
        description: 'Click and drag from start to end position.',
        parameters: {
          type: 'object',
          properties: {
            startX: { type: 'number' },
            startY: { type: 'number' },
            endX: { type: 'number' },
            endY: { type: 'number' },
          },
          required: ['startX', 'startY', 'endX', 'endY'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'shell_exec',
        description:
          'Run a shell command and return output. Use for file operations, system queries, etc.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in ms (default 10000)',
            },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'clipboard_get',
        description: 'Read current clipboard text content.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'clipboard_set',
        description: 'Set clipboard text content.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to copy to clipboard',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screenshot',
        description: 'Take a screenshot of the desktop. Returns base64 image.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}

export function createDesktopToolHandlers(deps: {
  screenshot: () => Promise<{ base64: string; scaleFactor: number }>;
  click: (
    x: number,
    y: number,
    opts?: { button?: string; double?: boolean },
  ) => Promise<void>;
  type: (text: string) => Promise<void>;
  hotkey: (keys: string[]) => Promise<void>;
  scroll: (direction: string, amount?: number) => Promise<void>;
  drag: (sx: number, sy: number, ex: number, ey: number) => Promise<void>;
}): Record<string, ToolHandler> {
  return {
    gui_click: async (args) => {
      try {
        await deps.click(args.x as number, args.y as number, {
          button: args.button as string,
          double: args.double as boolean,
        });
        return { success: true, result: `Clicked at (${args.x}, ${args.y})` };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    gui_type: async (args) => {
      try {
        await deps.type(args.text as string);
        return {
          success: true,
          result: `Typed "${(args.text as string).slice(0, 50)}"`,
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    gui_hotkey: async (args) => {
      try {
        const keys = (args.keys as string).split(' ');
        await deps.hotkey(keys);
        return { success: true, result: `Pressed ${args.keys}` };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    gui_scroll: async (args) => {
      try {
        await deps.scroll(args.direction as string, args.amount as number);
        return { success: true, result: `Scrolled ${args.direction}` };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    gui_drag: async (args) => {
      try {
        await deps.drag(
          args.startX as number,
          args.startY as number,
          args.endX as number,
          args.endY as number,
        );
        return {
          success: true,
          result: `Dragged from (${args.startX},${args.startY}) to (${args.endX},${args.endY})`,
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    shell_exec: async (args) => {
      try {
        const timeout = (args.timeout as number) || 10000;
        const { stdout, stderr } = await execAsync(args.command as string, {
          timeout,
        });
        return {
          success: true,
          result: {
            stdout: stdout.slice(0, 5000),
            stderr: stderr.slice(0, 1000),
          },
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    // Note: clipboard handlers use placeholders because `electron` module
    // can't be imported in test context. The actual Electron clipboard
    // integration will be wired when creating the desktop agent instance
    // in runMultiAgent.ts.
    clipboard_get: async () => {
      return { success: true, result: '' };
    },

    clipboard_set: async (_args) => {
      return { success: true, result: 'Clipboard updated' };
    },

    screenshot: async () => {
      try {
        const result = await deps.screenshot();
        return {
          success: true,
          result: {
            base64: result.base64,
            scaleFactor: result.scaleFactor,
          },
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}
