/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Page, KeyInput } from 'puppeteer-core';
import type { ToolDefinition, ToolHandler } from '@ui-tars/sdk';

export function getBrowserToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'gui_click',
        description:
          'Click an element by CSS selector or coordinates (x,y). Prefer selectors.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of element to click',
            },
            x: {
              type: 'number',
              description: 'X coordinate (use only if no selector)',
            },
            y: {
              type: 'number',
              description: 'Y coordinate (use only if no selector)',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_type',
        description:
          'Type text into an element. Optionally specify a selector to focus first.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
            selector: {
              type: 'string',
              description: 'CSS selector to focus before typing',
            },
            pressEnter: {
              type: 'boolean',
              description: 'Press Enter after typing',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_scroll',
        description: 'Scroll the page in a direction.',
        parameters: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['up', 'down', 'left', 'right'],
            },
            amount: {
              type: 'number',
              description: 'Pixels to scroll (default 300)',
            },
            selector: {
              type: 'string',
              description: 'Scroll within this element',
            },
          },
          required: ['direction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_hotkey',
        description: 'Press a keyboard shortcut. Keys separated by space.',
        parameters: {
          type: 'object',
          properties: {
            keys: {
              type: 'string',
              description: 'Keys to press, e.g. "ctrl c" or "Enter"',
            },
          },
          required: ['keys'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'dom_query',
        description:
          'Query DOM for elements matching a CSS selector. Returns element info.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'dom_getText',
        description: 'Get text content of an element.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector' },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'js_evaluate',
        description:
          'Execute JavaScript code on the page and return the result.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to evaluate',
            },
          },
          required: ['code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'page_navigate',
        description: 'Navigate to a URL.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'page_waitFor',
        description: 'Wait for an element to appear on the page.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to wait for',
            },
            timeout: {
              type: 'number',
              description: 'Max wait time in ms (default 5000)',
            },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screenshot',
        description:
          'Take a screenshot of the current page. Returns base64 image.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}

export function createBrowserToolHandlers(
  getPage: () => Page | null,
): Record<string, ToolHandler> {
  const withPage = async <T>(
    fn: (page: Page) => Promise<T>,
  ): Promise<{ success: boolean; result?: T; error?: string }> => {
    const page = getPage();
    if (!page) return { success: false, error: 'No active page' };
    try {
      const result = await fn(page);
      return { success: true, result };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  return {
    gui_click: async (args) =>
      withPage(async (page) => {
        if (args.selector) {
          await page.click(args.selector as string);
          return `Clicked ${args.selector}`;
        }
        if (args.x !== undefined && args.y !== undefined) {
          await page.mouse.click(args.x as number, args.y as number);
          return `Clicked at (${args.x}, ${args.y})`;
        }
        throw new Error('Provide selector or x,y coordinates');
      }),

    gui_type: async (args) =>
      withPage(async (page) => {
        if (args.selector) {
          await page.click(args.selector as string);
        }
        await page.keyboard.type(args.text as string);
        if (args.pressEnter) {
          await page.keyboard.press('Enter');
        }
        return `Typed "${(args.text as string).slice(0, 50)}"`;
      }),

    gui_scroll: async (args) =>
      withPage(async (page) => {
        const amount = (args.amount as number) || 300;
        const deltaX =
          args.direction === 'right'
            ? amount
            : args.direction === 'left'
              ? -amount
              : 0;
        const deltaY =
          args.direction === 'down'
            ? amount
            : args.direction === 'up'
              ? -amount
              : 0;
        await page.mouse.wheel({ deltaX, deltaY });
        return `Scrolled ${args.direction} by ${amount}px`;
      }),

    gui_hotkey: async (args) =>
      withPage(async (page) => {
        const keys = (args.keys as string).split(' ') as KeyInput[];
        for (let i = 0; i < keys.length - 1; i++) {
          await page.keyboard.down(keys[i]);
        }
        await page.keyboard.press(keys[keys.length - 1]);
        for (let i = keys.length - 2; i >= 0; i--) {
          await page.keyboard.up(keys[i]);
        }
        return `Pressed ${args.keys}`;
      }),

    dom_query: async (args) =>
      withPage(async (page) => {
        const elements = await page.$$(args.selector as string);
        const info = await Promise.all(
          elements.slice(0, 10).map(async (el) => {
            const text = await el.evaluate(
              (e) => e.textContent?.trim().slice(0, 100) ?? '',
            );
            const tag = await el.evaluate((e) => e.tagName.toLowerCase());
            const attrs = await el.evaluate((e) => {
              const a: Record<string, string> = {};
              for (const attr of [
                'id',
                'class',
                'href',
                'type',
                'role',
                'aria-label',
              ]) {
                const val = e.getAttribute(attr);
                if (val) a[attr] = val;
              }
              return a;
            });
            return { tag, text, attrs };
          }),
        );
        return { count: elements.length, elements: info };
      }),

    dom_getText: async (args) =>
      withPage(async (page) => {
        const el = await page.$(args.selector as string);
        if (!el) throw new Error(`Element not found: ${args.selector}`);
        return await el.evaluate((e) => e.textContent?.trim() ?? '');
      }),

    js_evaluate: async (args) =>
      withPage(async (page) => {
        return await page.evaluate(args.code as string);
      }),

    page_navigate: async (args) =>
      withPage(async (page) => {
        await page.goto(args.url as string, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        return `Navigated to ${args.url}`;
      }),

    page_waitFor: async (args) =>
      withPage(async (page) => {
        const timeout = (args.timeout as number) || 5000;
        await page.waitForSelector(args.selector as string, { timeout });
        return `Element ${args.selector} appeared`;
      }),

    screenshot: async () =>
      withPage(async (page) => {
        const buf = await page.screenshot({
          encoding: 'base64',
          type: 'jpeg',
          quality: 75,
        });
        return { base64: buf };
      }),
  };
}
