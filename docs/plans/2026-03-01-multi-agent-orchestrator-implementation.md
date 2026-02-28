# Multi-Agent Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-model vision-only agent loop with a multi-agent orchestrator that supports tool calling, DOM/accessibility grounding, MCP integrations, per-agent model selection, and self-healing recovery.

**Architecture:** A Planner agent decomposes user instructions into subtasks, routes them to specialized agents (Browser, Desktop, API), each with tool-calling capabilities. A rule-based Verifier confirms success after each action. A Memory system learns from past runs. The existing `GUIAgent` SDK becomes one execution strategy among several.

**Tech Stack:** TypeScript, Electron, OpenAI SDK (tool calling via `tools` parameter), Puppeteer/CDP (DOM extraction), native accessibility APIs (macOS AX / Windows UIA), better-sqlite3 (memory), MCP protocol (`@modelcontextprotocol/sdk`), Vitest (testing).

**Design Doc:** `docs/plans/2026-03-01-multi-agent-orchestrator-design.md`

---

## Phase 1: Tool-Calling Foundation

### Task 1: Create the ToolCallingModel class

**Files:**
- Create: `packages/ui-tars/sdk/src/ToolCallingModel.ts`
- Modify: `packages/ui-tars/sdk/src/index.ts` (export new class)
- Test: `packages/ui-tars/sdk/tests/ToolCallingModel.test.ts`

**Context:** The existing `UITarsModel` in `packages/ui-tars/sdk/src/Model.ts` uses OpenAI Chat Completions with text prediction + `actionParser`. The new `ToolCallingModel` uses OpenAI's `tools` parameter so the model returns structured function calls instead of text that needs parsing. This is the foundation for all agent tool calling.

**Step 1: Write the failing test**

Create `packages/ui-tars/sdk/tests/ToolCallingModel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolCallingModel, ToolDefinition } from '../src/ToolCallingModel';

// Mock OpenAI
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    __mockCreate: mockCreate,
  };
});

describe('ToolCallingModel', () => {
  const tools: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'gui_click',
        description: 'Click at coordinates or CSS selector',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'CSS selector or "x,y" coordinates' },
          },
          required: ['target'],
        },
      },
    },
  ];

  it('should send tools parameter in the API call', async () => {
    const { __mockCreate: mockCreate } = await import('openai');
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'gui_click', arguments: '{"target":"#btn"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { total_tokens: 100 },
    });

    const model = new ToolCallingModel({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4.6',
    });

    const result = await model.invokeWithTools({
      messages: [{ role: 'user', content: 'Click the submit button' }],
      tools,
      signal: undefined,
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].function.name).toBe('gui_click');
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({ target: '#btn' });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tools }),
      expect.anything(),
    );
  });

  it('should return text content when model responds without tool calls', async () => {
    const { __mockCreate: mockCreate } = await import('openai');
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: 'Task is complete', tool_calls: undefined },
        finish_reason: 'stop',
      }],
      usage: { total_tokens: 50 },
    });

    const model = new ToolCallingModel({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4.6',
    });

    const result = await model.invokeWithTools({
      messages: [{ role: 'user', content: 'Done?' }],
      tools,
    });

    expect(result.toolCalls).toHaveLength(0);
    expect(result.textContent).toBe('Task is complete');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/ToolCallingModel.test.ts`
Expected: FAIL — module `../src/ToolCallingModel` not found

**Step 3: Write minimal implementation**

Create `packages/ui-tars/sdk/src/ToolCallingModel.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

export type ToolDefinition = ChatCompletionTool;

export interface ToolCallResult {
  toolCalls: ChatCompletionMessageToolCall[];
  textContent: string | null;
  costTime?: number;
  costTokens?: number;
  finishReason: string;
}

export interface ToolCallingModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export class ToolCallingModel {
  private config: ToolCallingModelConfig;

  constructor(config: ToolCallingModelConfig) {
    this.config = config;
  }

  get modelName(): string {
    return this.config.model;
  }

  async invokeWithTools(params: {
    messages: ChatCompletionMessageParam[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<ToolCallResult> {
    const { messages, tools, signal, headers } = params;
    const {
      baseURL,
      apiKey,
      model,
      temperature = 0,
      maxTokens = 4096,
    } = this.config;

    const openai = new OpenAI({ baseURL, apiKey, maxRetries: 0 });

    const startTime = Date.now();
    const result = await openai.chat.completions.create(
      {
        model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: false,
        temperature,
        max_tokens: maxTokens,
      },
      { signal, timeout: 30_000, headers },
    );

    const choice = result.choices[0];
    return {
      toolCalls: choice?.message?.tool_calls ?? [],
      textContent: choice?.message?.content ?? null,
      costTime: Date.now() - startTime,
      costTokens: result.usage?.total_tokens ?? 0,
      finishReason: choice?.finish_reason ?? 'unknown',
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/ToolCallingModel.test.ts`
Expected: PASS

**Step 5: Export from SDK index**

Modify `packages/ui-tars/sdk/src/index.ts` — add:
```typescript
export { ToolCallingModel, type ToolDefinition, type ToolCallResult, type ToolCallingModelConfig } from './ToolCallingModel';
```

**Step 6: Commit**

```bash
git add packages/ui-tars/sdk/src/ToolCallingModel.ts packages/ui-tars/sdk/tests/ToolCallingModel.test.ts packages/ui-tars/sdk/src/index.ts
git commit -m "feat: add ToolCallingModel with OpenAI tools parameter support"
```

---

### Task 2: Create tool-calling agent loop (AgentLoop)

**Files:**
- Create: `packages/ui-tars/sdk/src/AgentLoop.ts`
- Test: `packages/ui-tars/sdk/tests/AgentLoop.test.ts`

**Context:** The existing `GUIAgent.run()` in `packages/ui-tars/sdk/src/GUIAgent.ts:66-520` is a monolithic loop: screenshot → model.invoke() → actionParser → operator.execute(). The new `AgentLoop` is a generic tool-calling loop: it sends messages + tools to the model, receives tool calls, executes them via a tool registry, feeds results back, and repeats until the model stops calling tools.

**Step 1: Write the failing test**

Create `packages/ui-tars/sdk/tests/AgentLoop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop, ToolHandler } from '../src/AgentLoop';
import { ToolCallingModel } from '../src/ToolCallingModel';

vi.mock('../src/ToolCallingModel');

describe('AgentLoop', () => {
  it('should execute tool calls and feed results back to model', async () => {
    const mockModel = {
      invokeWithTools: vi.fn()
        // First call: model returns a tool call
        .mockResolvedValueOnce({
          toolCalls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'gui_click', arguments: '{"target":"#btn"}' },
          }],
          textContent: null,
          finishReason: 'tool_calls',
          costTokens: 100,
        })
        // Second call: model says done
        .mockResolvedValueOnce({
          toolCalls: [],
          textContent: 'Clicked the button successfully.',
          finishReason: 'stop',
          costTokens: 50,
        }),
      modelName: 'test-model',
    } as unknown as ToolCallingModel;

    const clickHandler: ToolHandler = vi.fn().mockResolvedValue({
      success: true,
      result: 'Clicked #btn',
    });

    const loop = new AgentLoop({
      model: mockModel,
      tools: [{
        type: 'function',
        function: {
          name: 'gui_click',
          description: 'Click element',
          parameters: {
            type: 'object',
            properties: { target: { type: 'string' } },
            required: ['target'],
          },
        },
      }],
      toolHandlers: { gui_click: clickHandler },
      maxIterations: 10,
    });

    const result = await loop.run({
      systemPrompt: 'You are a browser agent.',
      userMessage: 'Click the submit button',
    });

    expect(clickHandler).toHaveBeenCalledWith({ target: '#btn' });
    expect(result.finalText).toBe('Clicked the button successfully.');
    expect(result.iterations).toBe(2);
    expect(mockModel.invokeWithTools).toHaveBeenCalledTimes(2);
  });

  it('should stop after maxIterations', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'noop', arguments: '{}' },
        }],
        textContent: null,
        finishReason: 'tool_calls',
        costTokens: 10,
      }),
      modelName: 'test-model',
    } as unknown as ToolCallingModel;

    const loop = new AgentLoop({
      model: mockModel,
      tools: [{
        type: 'function',
        function: { name: 'noop', description: 'noop', parameters: { type: 'object', properties: {} } },
      }],
      toolHandlers: { noop: vi.fn().mockResolvedValue({ success: true }) },
      maxIterations: 3,
    });

    const result = await loop.run({
      systemPrompt: 'test',
      userMessage: 'loop forever',
    });

    expect(result.iterations).toBe(3);
    expect(result.stoppedReason).toBe('max_iterations');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/AgentLoop.test.ts`
Expected: FAIL — module `../src/AgentLoop` not found

**Step 3: Write minimal implementation**

Create `packages/ui-tars/sdk/src/AgentLoop.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ToolCallingModel, type ToolDefinition } from './ToolCallingModel';

export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}>;

export interface AgentLoopConfig {
  model: ToolCallingModel;
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  maxIterations?: number;
  signal?: AbortSignal;
  onIteration?: (iteration: number, messages: ChatCompletionMessageParam[]) => void;
  logger?: Pick<Console, 'info' | 'error' | 'warn'>;
}

export interface AgentLoopResult {
  finalText: string | null;
  iterations: number;
  totalTokens: number;
  stoppedReason: 'completed' | 'max_iterations' | 'aborted' | 'error';
  messages: ChatCompletionMessageParam[];
}

export class AgentLoop {
  private config: AgentLoopConfig;

  constructor(config: AgentLoopConfig) {
    this.config = config;
  }

  async run(params: {
    systemPrompt: string;
    userMessage: string;
    images?: string[];
    additionalContext?: ChatCompletionMessageParam[];
  }): Promise<AgentLoopResult> {
    const { model, tools, toolHandlers, maxIterations = 25, signal, onIteration, logger } = this.config;
    const messages: ChatCompletionMessageParam[] = [];

    // System message
    messages.push({ role: 'system', content: params.systemPrompt });

    // Additional context (e.g., memory, previous agent results)
    if (params.additionalContext) {
      messages.push(...params.additionalContext);
    }

    // User message (with optional images)
    if (params.images && params.images.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: params.userMessage },
          ...params.images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.startsWith('data:') ? img : `data:image/png;base64,${img}` },
          })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: params.userMessage });
    }

    let iterations = 0;
    let totalTokens = 0;

    while (iterations < maxIterations) {
      if (signal?.aborted) {
        return { finalText: null, iterations, totalTokens, stoppedReason: 'aborted', messages };
      }

      iterations++;
      onIteration?.(iterations, messages);

      const response = await model.invokeWithTools({
        messages,
        tools,
        signal,
      });

      totalTokens += response.costTokens ?? 0;

      // No tool calls — model is done
      if (response.toolCalls.length === 0) {
        return {
          finalText: response.textContent,
          iterations,
          totalTokens,
          stoppedReason: 'completed',
          messages,
        };
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.textContent,
        tool_calls: response.toolCalls,
      } as ChatCompletionMessageParam);

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        const handler = toolHandlers[toolCall.function.name];
        let toolResult: string;

        if (!handler) {
          toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
          logger?.error(`[AgentLoop] Unknown tool: ${toolCall.function.name}`);
        } else {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await handler(args);
            toolResult = JSON.stringify(result);
          } catch (e) {
            toolResult = JSON.stringify({
              error: e instanceof Error ? e.message : 'Tool execution failed',
            });
            logger?.error(`[AgentLoop] Tool ${toolCall.function.name} error:`, e);
          }
        }

        // Add tool result message
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        } as ChatCompletionMessageParam);
      }
    }

    return {
      finalText: null,
      iterations,
      totalTokens,
      stoppedReason: 'max_iterations',
      messages,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/AgentLoop.test.ts`
Expected: PASS

**Step 5: Export from SDK index**

Add to `packages/ui-tars/sdk/src/index.ts`:
```typescript
export { AgentLoop, type ToolHandler, type AgentLoopConfig, type AgentLoopResult } from './AgentLoop';
```

**Step 6: Commit**

```bash
git add packages/ui-tars/sdk/src/AgentLoop.ts packages/ui-tars/sdk/tests/AgentLoop.test.ts packages/ui-tars/sdk/src/index.ts
git commit -m "feat: add AgentLoop for tool-calling agent execution"
```

---

### Task 3: Create Browser Agent tool definitions and handlers

**Files:**
- Create: `apps/ui-tars/src/main/agent/tools/browserTools.ts`
- Test: `apps/ui-tars/src/main/agent/tools/browserTools.test.ts`

**Context:** The Browser Agent needs tools for DOM interaction via CDP (Chrome DevTools Protocol). The existing `EmbeddedBrowserOperator` in `apps/ui-tars/src/main/agent/webviewOperator.ts` uses Puppeteer. We build on this by creating tool definitions that the `AgentLoop` can use, where each tool handler calls Puppeteer/CDP methods on the active page.

**Step 1: Write the failing test**

Create `apps/ui-tars/src/main/agent/tools/browserTools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getBrowserToolDefinitions, createBrowserToolHandlers } from './browserTools';

describe('browserTools', () => {
  it('should return tool definitions with correct names', () => {
    const tools = getBrowserToolDefinitions();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('gui_click');
    expect(names).toContain('gui_type');
    expect(names).toContain('gui_scroll');
    expect(names).toContain('dom_query');
    expect(names).toContain('dom_getText');
    expect(names).toContain('js_evaluate');
    expect(names).toContain('page_navigate');
    expect(names).toContain('page_waitFor');
    expect(names).toContain('screenshot');
  });

  it('should create handlers that call page methods', async () => {
    const mockPage = {
      click: vi.fn(),
      type: vi.fn(),
      goto: vi.fn(),
      evaluate: vi.fn().mockResolvedValue('result'),
      waitForSelector: vi.fn(),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('img')),
      $: vi.fn().mockResolvedValue({ textContent: 'Hello' }),
      $$: vi.fn().mockResolvedValue([]),
    };

    const handlers = createBrowserToolHandlers(() => mockPage as any);

    const result = await handlers.dom_query({ selector: '#test' });
    expect(result.success).toBe(true);
    expect(mockPage.$$).toHaveBeenCalledWith('#test');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/tools/browserTools.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `apps/ui-tars/src/main/agent/tools/browserTools.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Page } from 'puppeteer-core';
import type { ToolDefinition, ToolHandler } from '@ui-tars/sdk';

export function getBrowserToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'gui_click',
        description: 'Click an element by CSS selector or coordinates (x,y). Prefer selectors.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of element to click' },
            x: { type: 'number', description: 'X coordinate (use only if no selector)' },
            y: { type: 'number', description: 'Y coordinate (use only if no selector)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gui_type',
        description: 'Type text into an element. Optionally specify a selector to focus first.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
            selector: { type: 'string', description: 'CSS selector to focus before typing' },
            pressEnter: { type: 'boolean', description: 'Press Enter after typing' },
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
            direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
            amount: { type: 'number', description: 'Pixels to scroll (default 300)' },
            selector: { type: 'string', description: 'Scroll within this element' },
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
            keys: { type: 'string', description: 'Keys to press, e.g. "ctrl c" or "Enter"' },
          },
          required: ['keys'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'dom_query',
        description: 'Query DOM for elements matching a CSS selector. Returns element info.',
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
        description: 'Execute JavaScript code on the page and return the result.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'JavaScript code to evaluate' },
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
            selector: { type: 'string', description: 'CSS selector to wait for' },
            timeout: { type: 'number', description: 'Max wait time in ms (default 5000)' },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screenshot',
        description: 'Take a screenshot of the current page. Returns base64 image.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}

export function createBrowserToolHandlers(
  getPage: () => Page | null,
): Record<string, ToolHandler> {
  const withPage = async <T>(fn: (page: Page) => Promise<T>): Promise<{ success: boolean; result?: T; error?: string }> => {
    const page = getPage();
    if (!page) return { success: false, error: 'No active page' };
    try {
      const result = await fn(page);
      return { success: true, result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  return {
    gui_click: async (args) => withPage(async (page) => {
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

    gui_type: async (args) => withPage(async (page) => {
      if (args.selector) {
        await page.click(args.selector as string);
      }
      await page.keyboard.type(args.text as string);
      if (args.pressEnter) {
        await page.keyboard.press('Enter');
      }
      return `Typed "${(args.text as string).slice(0, 50)}"`;
    }),

    gui_scroll: async (args) => withPage(async (page) => {
      const amount = (args.amount as number) || 300;
      const deltaX = args.direction === 'right' ? amount : args.direction === 'left' ? -amount : 0;
      const deltaY = args.direction === 'down' ? amount : args.direction === 'up' ? -amount : 0;
      await page.mouse.wheel({ deltaX, deltaY });
      return `Scrolled ${args.direction} by ${amount}px`;
    }),

    gui_hotkey: async (args) => withPage(async (page) => {
      const keys = (args.keys as string).split(' ');
      for (let i = 0; i < keys.length - 1; i++) {
        await page.keyboard.down(keys[i]);
      }
      await page.keyboard.press(keys[keys.length - 1]);
      for (let i = keys.length - 2; i >= 0; i--) {
        await page.keyboard.up(keys[i]);
      }
      return `Pressed ${args.keys}`;
    }),

    dom_query: async (args) => withPage(async (page) => {
      const elements = await page.$$(args.selector as string);
      const info = await Promise.all(
        elements.slice(0, 10).map(async (el) => {
          const text = await el.evaluate((e) => e.textContent?.trim().slice(0, 100) ?? '');
          const tag = await el.evaluate((e) => e.tagName.toLowerCase());
          const attrs = await el.evaluate((e) => {
            const a: Record<string, string> = {};
            for (const attr of ['id', 'class', 'href', 'type', 'role', 'aria-label']) {
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

    dom_getText: async (args) => withPage(async (page) => {
      const el = await page.$(args.selector as string);
      if (!el) throw new Error(`Element not found: ${args.selector}`);
      return await el.evaluate((e) => e.textContent?.trim() ?? '');
    }),

    js_evaluate: async (args) => withPage(async (page) => {
      return await page.evaluate(args.code as string);
    }),

    page_navigate: async (args) => withPage(async (page) => {
      await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return `Navigated to ${args.url}`;
    }),

    page_waitFor: async (args) => withPage(async (page) => {
      const timeout = (args.timeout as number) || 5000;
      await page.waitForSelector(args.selector as string, { timeout });
      return `Element ${args.selector} appeared`;
    }),

    screenshot: async () => withPage(async (page) => {
      const buf = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 75 });
      return { base64: buf };
    }),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/tools/browserTools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui-tars/src/main/agent/tools/browserTools.ts apps/ui-tars/src/main/agent/tools/browserTools.test.ts
git commit -m "feat: add browser agent tool definitions and handlers"
```

---

### Task 4: Create Desktop Agent tool definitions and handlers

**Files:**
- Create: `apps/ui-tars/src/main/agent/tools/desktopTools.ts`
- Test: `apps/ui-tars/src/main/agent/tools/desktopTools.test.ts`

**Context:** Desktop tools wrap the existing nut-js operations (`NutJSElectronOperator` in `apps/ui-tars/src/main/agent/operator.ts`) as tool-callable functions. Also adds shell_exec, file_read, clipboard tools. OS accessibility tree extraction is Phase 3 — this task adds the GUI action tools and basic system tools.

**Step 1: Write the failing test**

Create `apps/ui-tars/src/main/agent/tools/desktopTools.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getDesktopToolDefinitions } from './desktopTools';

describe('desktopTools', () => {
  it('should return tool definitions with correct names', () => {
    const tools = getDesktopToolDefinitions();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('gui_click');
    expect(names).toContain('gui_type');
    expect(names).toContain('gui_hotkey');
    expect(names).toContain('gui_scroll');
    expect(names).toContain('gui_drag');
    expect(names).toContain('shell_exec');
    expect(names).toContain('clipboard_get');
    expect(names).toContain('clipboard_set');
    expect(names).toContain('screenshot');
  });

  it('all tools should have valid function schemas', () => {
    const tools = getDesktopToolDefinitions();
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeTruthy();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/tools/desktopTools.test.ts`
Expected: FAIL

**Step 3: Write implementation**

Create `apps/ui-tars/src/main/agent/tools/desktopTools.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { clipboard } from 'electron';
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
            button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default left)' },
            double: { type: 'boolean', description: 'Double click (default false)' },
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
        description: 'Press keyboard shortcut. Keys separated by space, lowercase.',
        parameters: {
          type: 'object',
          properties: {
            keys: { type: 'string', description: 'e.g. "ctrl c", "alt f4", "return"' },
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
            direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
            amount: { type: 'number', description: 'Scroll amount (default 3 lines)' },
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
        description: 'Run a shell command and return output. Use for file operations, system queries, etc.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            timeout: { type: 'number', description: 'Timeout in ms (default 10000)' },
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
            text: { type: 'string', description: 'Text to copy to clipboard' },
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
  click: (x: number, y: number, opts?: { button?: string; double?: boolean }) => Promise<void>;
  type: (text: string) => Promise<void>;
  hotkey: (keys: string[]) => Promise<void>;
  scroll: (direction: string, amount?: number) => Promise<void>;
  drag: (sx: number, sy: number, ex: number, ey: number) => Promise<void>;
}): Record<string, ToolHandler> {
  return {
    gui_click: async (args) => {
      await deps.click(args.x as number, args.y as number, {
        button: args.button as string,
        double: args.double as boolean,
      });
      return { success: true, result: `Clicked at (${args.x}, ${args.y})` };
    },

    gui_type: async (args) => {
      await deps.type(args.text as string);
      return { success: true, result: `Typed "${(args.text as string).slice(0, 50)}"` };
    },

    gui_hotkey: async (args) => {
      const keys = (args.keys as string).split(' ');
      await deps.hotkey(keys);
      return { success: true, result: `Pressed ${args.keys}` };
    },

    gui_scroll: async (args) => {
      await deps.scroll(args.direction as string, args.amount as number);
      return { success: true, result: `Scrolled ${args.direction}` };
    },

    gui_drag: async (args) => {
      await deps.drag(
        args.startX as number, args.startY as number,
        args.endX as number, args.endY as number,
      );
      return { success: true, result: `Dragged from (${args.startX},${args.startY}) to (${args.endX},${args.endY})` };
    },

    shell_exec: async (args) => {
      try {
        const timeout = (args.timeout as number) || 10000;
        const { stdout, stderr } = await execAsync(args.command as string, { timeout });
        return { success: true, result: { stdout: stdout.slice(0, 5000), stderr: stderr.slice(0, 1000) } };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    clipboard_get: async () => {
      return { success: true, result: clipboard.readText() };
    },

    clipboard_set: async (args) => {
      clipboard.writeText(args.text as string);
      return { success: true, result: 'Clipboard updated' };
    },

    screenshot: async () => {
      const result = await deps.screenshot();
      return { success: true, result: { base64: result.base64, scaleFactor: result.scaleFactor } };
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/tools/desktopTools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui-tars/src/main/agent/tools/desktopTools.ts apps/ui-tars/src/main/agent/tools/desktopTools.test.ts
git commit -m "feat: add desktop agent tool definitions and handlers"
```

---

### Task 5: Create Verifier (rule-based post-action checker)

**Files:**
- Create: `packages/ui-tars/sdk/src/Verifier.ts`
- Test: `packages/ui-tars/sdk/tests/Verifier.test.ts`

**Context:** The Verifier confirms each action succeeded without calling the model. It compares state before and after action execution. For browser: DOM diff. For desktop: screenshot perceptual hash diff. For API: HTTP response status. See design doc "6. Verifier" section.

**Step 1: Write the failing test**

Create `packages/ui-tars/sdk/tests/Verifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Verifier, VerificationResult } from '../src/Verifier';

describe('Verifier', () => {
  describe('verifyApiResult', () => {
    it('should return success for 2xx status', () => {
      const result = Verifier.verifyApiResult({ status: 200, body: { ok: true } });
      expect(result.success).toBe(true);
    });

    it('should return failure for 4xx/5xx status', () => {
      const result = Verifier.verifyApiResult({ status: 500, body: { error: 'fail' } });
      expect(result.success).toBe(false);
    });
  });

  describe('verifyDomChange', () => {
    it('should detect URL change', () => {
      const result = Verifier.verifyDomChange({
        before: { url: 'https://example.com', title: 'A' },
        after: { url: 'https://example.com/page2', title: 'B' },
      });
      expect(result.success).toBe(true);
      expect(result.changes).toContain('url_changed');
    });

    it('should detect no change', () => {
      const state = { url: 'https://example.com', title: 'A' };
      const result = Verifier.verifyDomChange({ before: state, after: state });
      expect(result.success).toBe(false);
    });
  });

  describe('verifyScreenshotDiff', () => {
    it('should detect change when hashes differ', () => {
      const result = Verifier.verifyScreenshotDiff({
        beforeHash: 'abcdef1234567890',
        afterHash: 'zzzzzzz123456789',
      });
      expect(result.success).toBe(true);
    });

    it('should detect no change when hashes match', () => {
      const result = Verifier.verifyScreenshotDiff({
        beforeHash: 'abcdef1234567890',
        afterHash: 'abcdef1234567890',
      });
      expect(result.success).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/Verifier.test.ts`
Expected: FAIL

**Step 3: Write implementation**

Create `packages/ui-tars/sdk/src/Verifier.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VerificationResult {
  success: boolean;
  changes: string[];
  details?: string;
}

interface DomState {
  url: string;
  title: string;
  elementCount?: number;
  bodyText?: string;
}

export class Verifier {
  static verifyApiResult(response: { status: number; body?: unknown }): VerificationResult {
    const success = response.status >= 200 && response.status < 300;
    return {
      success,
      changes: success ? ['api_success'] : ['api_error'],
      details: success ? `HTTP ${response.status}` : `HTTP ${response.status}: ${JSON.stringify(response.body)}`,
    };
  }

  static verifyDomChange(params: { before: DomState; after: DomState }): VerificationResult {
    const changes: string[] = [];

    if (params.before.url !== params.after.url) {
      changes.push('url_changed');
    }
    if (params.before.title !== params.after.title) {
      changes.push('title_changed');
    }
    if (
      params.before.elementCount !== undefined &&
      params.after.elementCount !== undefined &&
      params.before.elementCount !== params.after.elementCount
    ) {
      changes.push('element_count_changed');
    }
    if (
      params.before.bodyText !== undefined &&
      params.after.bodyText !== undefined &&
      params.before.bodyText !== params.after.bodyText
    ) {
      changes.push('content_changed');
    }

    return {
      success: changes.length > 0,
      changes,
      details: changes.length > 0 ? `Detected: ${changes.join(', ')}` : 'No changes detected',
    };
  }

  static verifyScreenshotDiff(params: {
    beforeHash: string;
    afterHash: string;
    threshold?: number;
  }): VerificationResult {
    const different = params.beforeHash !== params.afterHash;
    return {
      success: different,
      changes: different ? ['screenshot_changed'] : [],
      details: different ? 'Screen content changed' : 'No visual change detected',
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/ui-tars/sdk/tests/Verifier.test.ts`
Expected: PASS

**Step 5: Export and commit**

Add to `packages/ui-tars/sdk/src/index.ts`:
```typescript
export { Verifier, type VerificationResult } from './Verifier';
```

```bash
git add packages/ui-tars/sdk/src/Verifier.ts packages/ui-tars/sdk/tests/Verifier.test.ts packages/ui-tars/sdk/src/index.ts
git commit -m "feat: add rule-based Verifier for post-action checking"
```

---

### Task 6: Add per-agent model settings to the store

**Files:**
- Modify: `apps/ui-tars/src/main/store/validate.ts` (add new fields)
- Modify: `apps/ui-tars/src/main/store/setting.ts` (update defaults)
- Modify: `apps/ui-tars/src/main/store/types.ts` (re-export)

**Context:** Currently `LocalStore` in `apps/ui-tars/src/main/store/validate.ts:16-36` has a single VLM model config (`vlmProvider`, `vlmBaseUrl`, `vlmApiKey`, `vlmModelName`). We need to add per-agent model names while keeping the single API key + base URL pattern. The settings page will be updated in Phase 5 — this task only extends the data layer.

**Step 1: Add new fields to validate.ts**

Modify `apps/ui-tars/src/main/store/validate.ts` — extend `PresetSchema`:

```typescript
// After existing vlmModelName field, add:
  // Per-agent model selection (optional — defaults to vlmModelName)
  plannerModel: z.string().optional(),
  browserAgentModel: z.string().optional(),
  desktopAgentModel: z.string().optional(),
  apiAgentModel: z.string().optional(),
  // Multi-agent mode toggle
  multiAgentEnabled: z.boolean().optional(),
```

**Step 2: Update defaults in setting.ts**

Modify `apps/ui-tars/src/main/store/setting.ts` — add to `DEFAULT_SETTING`:

```typescript
  plannerModel: '',
  browserAgentModel: '',
  desktopAgentModel: '',
  apiAgentModel: '',
  multiAgentEnabled: false,
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/main/store/validate.ts apps/ui-tars/src/main/store/setting.ts
git commit -m "feat: add per-agent model selection fields to settings store"
```

---

## Phase 2: Multi-Agent Orchestration

### Task 7: Create the Planner Agent

**Files:**
- Create: `apps/ui-tars/src/main/agent/planner/PlannerAgent.ts`
- Create: `apps/ui-tars/src/main/agent/planner/plannerPrompt.ts`
- Test: `apps/ui-tars/src/main/agent/planner/PlannerAgent.test.ts`

**Context:** The Planner Agent takes a user instruction and decomposes it into a JSON execution plan. It uses the `ToolCallingModel` with a single tool `create_plan` that forces the model to output structured JSON. See design doc "1. Planner Agent" section.

**Step 1: Write the planner prompt**

Create `apps/ui-tars/src/main/agent/planner/plannerPrompt.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PlanStep {
  id: number;
  agent: 'browser' | 'desktop' | 'api';
  task: string;
  depends_on: number[];
  verify: boolean;
}

export interface ExecutionPlan {
  plan: PlanStep[];
  reasoning: string;
}

export function getPlannerSystemPrompt(params: {
  availableAgents: string[];
  mcpToolsSummary?: string;
  memoryContext?: string;
  currentState?: string;
}): string {
  return `You are a task planning agent. Your job is to decompose a user's instruction into an ordered list of atomic subtasks and assign each to the best agent.

## Available Agents
${params.availableAgents.map((a) => `- **${a}**`).join('\n')}

## Rules
1. Break complex tasks into small, atomic subtasks (each should take 1-5 actions).
2. Assign each subtask to the most appropriate agent:
   - **browser**: Web tasks (search, navigate, fill forms, extract data)
   - **desktop**: Native app tasks (click UI, type, file operations, system interactions)
   - **api**: Direct service calls when MCP tools are available (email, messaging, databases)
3. Prefer **api** agent when an MCP tool exists for the service — it's faster and more reliable than GUI.
4. Set \`depends_on\` to enforce execution order. Independent tasks can run in parallel.
5. Set \`verify: true\` for actions that must succeed before continuing.
6. If the task is simple (single agent, 1-2 steps), still create a plan — just make it short.

${params.mcpToolsSummary ? `## Available MCP Tools\n${params.mcpToolsSummary}\n` : ''}
${params.memoryContext ? `## Relevant Memory\n${params.memoryContext}\n` : ''}
${params.currentState ? `## Current System State\n${params.currentState}\n` : ''}

Use the create_plan tool to output your execution plan.`;
}

export function getPlannerToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: 'create_plan',
      description: 'Create an execution plan for the user task.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why you chose this plan structure.',
          },
          plan: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Step ID (1-indexed)' },
                agent: { type: 'string', enum: ['browser', 'desktop', 'api'] },
                task: { type: 'string', description: 'Clear, actionable subtask description' },
                depends_on: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'IDs of steps that must complete before this one',
                },
                verify: { type: 'boolean', description: 'Whether to verify this step succeeded' },
              },
              required: ['id', 'agent', 'task', 'depends_on', 'verify'],
            },
          },
        },
        required: ['reasoning', 'plan'],
      },
    },
  };
}
```

**Step 2: Write the PlannerAgent class**

Create `apps/ui-tars/src/main/agent/planner/PlannerAgent.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolCallingModel } from '@ui-tars/sdk';
import {
  getPlannerSystemPrompt,
  getPlannerToolDefinition,
  type ExecutionPlan,
  type PlanStep,
} from './plannerPrompt';
import { logger } from '@main/logger';

export interface PlannerConfig {
  model: ToolCallingModel;
  availableAgents: string[];
  mcpToolsSummary?: string;
}

export class PlannerAgent {
  private model: ToolCallingModel;
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.model = config.model;
    this.config = config;
  }

  async createPlan(params: {
    instruction: string;
    memoryContext?: string;
    currentState?: string;
    signal?: AbortSignal;
  }): Promise<ExecutionPlan> {
    const systemPrompt = getPlannerSystemPrompt({
      availableAgents: this.config.availableAgents,
      mcpToolsSummary: this.config.mcpToolsSummary,
      memoryContext: params.memoryContext,
      currentState: params.currentState,
    });

    const result = await this.model.invokeWithTools({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: params.instruction },
      ],
      tools: [getPlannerToolDefinition()],
      signal: params.signal,
    });

    // Extract plan from tool call
    const planCall = result.toolCalls.find((tc) => tc.function.name === 'create_plan');
    if (!planCall) {
      // Fallback: single-step plan using the default agent
      logger.warn('[PlannerAgent] Model did not call create_plan. Creating fallback plan.');
      return {
        reasoning: 'Single-step task — no decomposition needed.',
        plan: [{
          id: 1,
          agent: this.inferAgent(params.instruction),
          task: params.instruction,
          depends_on: [],
          verify: true,
        }],
      };
    }

    const parsed: ExecutionPlan = JSON.parse(planCall.function.arguments);
    logger.info('[PlannerAgent] Created plan:', JSON.stringify(parsed, null, 2));
    return parsed;
  }

  private inferAgent(instruction: string): 'browser' | 'desktop' | 'api' {
    const lower = instruction.toLowerCase();
    if (lower.includes('website') || lower.includes('browser') || lower.includes('url') || lower.includes('search') || lower.includes('google')) {
      return 'browser';
    }
    if (lower.includes('email') || lower.includes('api') || lower.includes('send') || lower.includes('slack')) {
      return 'api';
    }
    return 'desktop';
  }
}

export type { ExecutionPlan, PlanStep };
```

**Step 3: Write the test**

Create `apps/ui-tars/src/main/agent/planner/PlannerAgent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PlannerAgent } from './PlannerAgent';

vi.mock('@main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('PlannerAgent', () => {
  it('should parse a plan from model tool call', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: {
            name: 'create_plan',
            arguments: JSON.stringify({
              reasoning: 'Need to search then email',
              plan: [
                { id: 1, agent: 'browser', task: 'Search for flights', depends_on: [], verify: true },
                { id: 2, agent: 'api', task: 'Send email with results', depends_on: [1], verify: true },
              ],
            }),
          },
        }],
        textContent: null,
        finishReason: 'tool_calls',
      }),
      modelName: 'test',
    };

    const planner = new PlannerAgent({
      model: mockModel as any,
      availableAgents: ['browser', 'desktop', 'api'],
    });

    const plan = await planner.createPlan({
      instruction: 'Find cheapest flight and email it to me',
    });

    expect(plan.plan).toHaveLength(2);
    expect(plan.plan[0].agent).toBe('browser');
    expect(plan.plan[1].depends_on).toEqual([1]);
  });

  it('should create fallback plan when model returns no tool call', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [],
        textContent: 'I will help you search.',
        finishReason: 'stop',
      }),
      modelName: 'test',
    };

    const planner = new PlannerAgent({
      model: mockModel as any,
      availableAgents: ['browser', 'desktop', 'api'],
    });

    const plan = await planner.createPlan({
      instruction: 'Search for flights on Google',
    });

    expect(plan.plan).toHaveLength(1);
    expect(plan.plan[0].agent).toBe('browser');
  });
});
```

**Step 4: Run tests**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/planner/PlannerAgent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui-tars/src/main/agent/planner/
git commit -m "feat: add PlannerAgent for task decomposition"
```

---

### Task 8: Create the Orchestrator (agent dispatcher + step runner)

**Files:**
- Create: `apps/ui-tars/src/main/agent/orchestrator/Orchestrator.ts`
- Test: `apps/ui-tars/src/main/agent/orchestrator/Orchestrator.test.ts`

**Context:** The Orchestrator ties everything together. It:
1. Calls PlannerAgent to decompose the task
2. Iterates through steps in dependency order
3. Routes each step to the correct agent (Browser/Desktop/API)
4. Calls Verifier after each step
5. Handles recovery cascade on failure

This is the entry point that replaces `runAgent()` in `apps/ui-tars/src/main/services/runAgent.ts` when `multiAgentEnabled` is true.

**Step 1: Write the Orchestrator**

Create `apps/ui-tars/src/main/agent/orchestrator/Orchestrator.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolCallingModel, AgentLoop, Verifier } from '@ui-tars/sdk';
import { PlannerAgent, type ExecutionPlan, type PlanStep } from '../planner/PlannerAgent';
import { logger } from '@main/logger';

export type AgentType = 'browser' | 'desktop' | 'api';

export interface OrchestratorAgent {
  type: AgentType;
  loop: AgentLoop;
}

export interface StepResult {
  stepId: number;
  success: boolean;
  result?: string;
  error?: string;
  retries: number;
}

export interface OrchestratorConfig {
  plannerModel: ToolCallingModel;
  agents: Record<AgentType, OrchestratorAgent | null>;
  signal?: AbortSignal;
  maxRetries?: number;
  onStepStart?: (step: PlanStep) => void;
  onStepComplete?: (step: PlanStep, result: StepResult) => void;
  onPlanCreated?: (plan: ExecutionPlan) => void;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private planner: PlannerAgent;
  private stepResults: Map<number, StepResult> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.planner = new PlannerAgent({
      model: config.plannerModel,
      availableAgents: Object.entries(config.agents)
        .filter(([, agent]) => agent !== null)
        .map(([type]) => type),
    });
  }

  async run(instruction: string): Promise<{
    plan: ExecutionPlan;
    results: StepResult[];
    success: boolean;
  }> {
    // Step 1: Create plan
    logger.info('[Orchestrator] Creating plan for:', instruction);
    const plan = await this.planner.createPlan({
      instruction,
      signal: this.config.signal,
    });
    this.config.onPlanCreated?.(plan);
    logger.info('[Orchestrator] Plan created with', plan.plan.length, 'steps');

    // Step 2: Execute steps in dependency order
    const results: StepResult[] = [];
    const completed = new Set<number>();

    while (completed.size < plan.plan.length) {
      if (this.config.signal?.aborted) {
        break;
      }

      // Find steps whose dependencies are all completed
      const ready = plan.plan.filter(
        (step) =>
          !completed.has(step.id) &&
          step.depends_on.every((dep) => completed.has(dep)),
      );

      if (ready.length === 0) {
        logger.error('[Orchestrator] Deadlock — no ready steps but plan not complete');
        break;
      }

      // Execute ready steps (could parallelize independent steps in future)
      for (const step of ready) {
        const result = await this.executeStep(step);
        results.push(result);
        this.stepResults.set(step.id, result);

        if (result.success) {
          completed.add(step.id);
        } else {
          // Recovery: try to continue with remaining steps
          logger.warn(`[Orchestrator] Step ${step.id} failed:`, result.error);
          completed.add(step.id); // Mark as "attempted" to prevent infinite loop
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    return { plan, results, success: allSuccess };
  }

  private async executeStep(step: PlanStep): Promise<StepResult> {
    this.config.onStepStart?.(step);
    const maxRetries = this.config.maxRetries ?? 2;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const agent = this.config.agents[step.agent];
      if (!agent) {
        return {
          stepId: step.id,
          success: false,
          error: `Agent "${step.agent}" not available`,
          retries: attempt,
        };
      }

      try {
        // Build context from previous step results
        const context = this.buildStepContext(step);

        const loopResult = await agent.loop.run({
          systemPrompt: `Execute this subtask: ${step.task}`,
          userMessage: `${step.task}\n\n${context}`,
        });

        const result: StepResult = {
          stepId: step.id,
          success: loopResult.stoppedReason === 'completed',
          result: loopResult.finalText ?? undefined,
          retries: attempt,
        };

        this.config.onStepComplete?.(step, result);

        if (result.success) {
          return result;
        }

        lastError = `Agent loop stopped: ${loopResult.stoppedReason}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        logger.error(`[Orchestrator] Step ${step.id} attempt ${attempt + 1} failed:`, lastError);
      }
    }

    const failResult: StepResult = {
      stepId: step.id,
      success: false,
      error: lastError,
      retries: maxRetries,
    };
    this.config.onStepComplete?.(step, failResult);
    return failResult;
  }

  private buildStepContext(step: PlanStep): string {
    if (step.depends_on.length === 0) return '';
    const parts: string[] = ['## Previous Step Results'];
    for (const depId of step.depends_on) {
      const dep = this.stepResults.get(depId);
      if (dep?.result) {
        parts.push(`Step ${depId}: ${dep.result}`);
      }
    }
    return parts.join('\n');
  }
}
```

**Step 2: Write the test**

Create `apps/ui-tars/src/main/agent/orchestrator/Orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from './Orchestrator';

vi.mock('@main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Orchestrator', () => {
  it('should create plan and execute steps in order', async () => {
    const mockPlannerModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: {
            name: 'create_plan',
            arguments: JSON.stringify({
              reasoning: 'Simple search task',
              plan: [
                { id: 1, agent: 'browser', task: 'Search Google', depends_on: [], verify: true },
                { id: 2, agent: 'browser', task: 'Extract results', depends_on: [1], verify: true },
              ],
            }),
          },
        }],
        textContent: null,
        finishReason: 'tool_calls',
      }),
      modelName: 'planner-model',
    };

    const mockBrowserLoop = {
      run: vi.fn()
        .mockResolvedValueOnce({ finalText: 'Searched Google', iterations: 3, stoppedReason: 'completed', totalTokens: 100, messages: [] })
        .mockResolvedValueOnce({ finalText: 'Found 5 results', iterations: 2, stoppedReason: 'completed', totalTokens: 80, messages: [] }),
    };

    const onStepStart = vi.fn();
    const onStepComplete = vi.fn();

    const orchestrator = new Orchestrator({
      plannerModel: mockPlannerModel as any,
      agents: {
        browser: { type: 'browser', loop: mockBrowserLoop as any },
        desktop: null,
        api: null,
      },
      onStepStart,
      onStepComplete,
    });

    const result = await orchestrator.run('Search for flights on Google');

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    expect(mockBrowserLoop.run).toHaveBeenCalledTimes(2);
    expect(onStepStart).toHaveBeenCalledTimes(2);
    expect(onStepComplete).toHaveBeenCalledTimes(2);
  });
});
```

**Step 3: Run test**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/orchestrator/Orchestrator.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/ui-tars/src/main/agent/orchestrator/ apps/ui-tars/src/main/agent/planner/
git commit -m "feat: add Orchestrator for multi-agent task execution"
```

---

### Task 9: Integrate Orchestrator into runAgent service

**Files:**
- Modify: `apps/ui-tars/src/main/services/runAgent.ts`
- Create: `apps/ui-tars/src/main/services/runMultiAgent.ts`

**Context:** The existing `runAgent()` in `apps/ui-tars/src/main/services/runAgent.ts:35-285` creates a single `GUIAgent` and runs it. When `multiAgentEnabled` is true in settings, we want to run the `Orchestrator` instead. We create `runMultiAgent()` as a separate function and modify `runAgent()` to dispatch between them.

**Step 1: Create runMultiAgent.ts**

Create `apps/ui-tars/src/main/services/runMultiAgent.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { StatusEnum } from '@ui-tars/shared/types';
import { ToolCallingModel, AgentLoop } from '@ui-tars/sdk';
import { Orchestrator } from '../agent/orchestrator/Orchestrator';
import { getBrowserToolDefinitions, createBrowserToolHandlers } from '../agent/tools/browserTools';
import { getDesktopToolDefinitions, createDesktopToolHandlers } from '../agent/tools/desktopTools';
import { NutJSElectronOperator } from '../agent/operator';
import { EmbeddedBrowserOperator } from '../agent/webviewOperator';
import { SettingStore } from '@main/store/setting';
import { AppState } from '@main/store/types';
import { logger } from '@main/logger';
import { beforeAgentRun, afterAgentRun } from '../utils/agent';

export const runMultiAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  const settings = SettingStore.getStore();
  const { instructions, abortController } = getState();
  if (!instructions) return;

  setState({ ...getState(), status: StatusEnum.RUNNING });

  // Create per-agent models
  const baseConfig = {
    baseURL: settings.vlmBaseUrl,
    apiKey: settings.vlmApiKey,
  };

  const plannerModel = new ToolCallingModel({
    ...baseConfig,
    model: settings.plannerModel || settings.vlmModelName,
  });

  // Browser agent setup
  let browserLoop: AgentLoop | null = null;
  try {
    const browserOp = new EmbeddedBrowserOperator();
    await browserOp.connect();
    const browserModel = new ToolCallingModel({
      ...baseConfig,
      model: settings.browserAgentModel || settings.vlmModelName,
    });
    const page = () => (browserOp as any).activePage ?? null;
    browserLoop = new AgentLoop({
      model: browserModel,
      tools: getBrowserToolDefinitions(),
      toolHandlers: createBrowserToolHandlers(page),
      maxIterations: 25,
      signal: abortController?.signal,
      logger,
    });
  } catch (e) {
    logger.warn('[runMultiAgent] Browser agent not available:', e);
  }

  // Desktop agent setup
  const desktopOp = new NutJSElectronOperator();
  const desktopModel = new ToolCallingModel({
    ...baseConfig,
    model: settings.desktopAgentModel || settings.vlmModelName,
  });
  const desktopLoop = new AgentLoop({
    model: desktopModel,
    tools: getDesktopToolDefinitions(),
    toolHandlers: createDesktopToolHandlers({
      screenshot: () => desktopOp.screenshot(),
      click: async (x, y) => { /* delegate to nut-js */ },
      type: async (text) => { /* delegate to nut-js */ },
      hotkey: async (keys) => { /* delegate to nut-js */ },
      scroll: async (dir) => { /* delegate to nut-js */ },
      drag: async (sx, sy, ex, ey) => { /* delegate to nut-js */ },
    }),
    maxIterations: 25,
    signal: abortController?.signal,
    logger,
  });

  // Create orchestrator
  const orchestrator = new Orchestrator({
    plannerModel,
    agents: {
      browser: browserLoop ? { type: 'browser', loop: browserLoop } : null,
      desktop: { type: 'desktop', loop: desktopLoop },
      api: null, // Phase 3
    },
    signal: abortController?.signal,
    onStepStart: (step) => {
      logger.info(`[Orchestrator] Starting step ${step.id}: ${step.task}`);
    },
    onStepComplete: (step, result) => {
      logger.info(`[Orchestrator] Step ${step.id} ${result.success ? 'succeeded' : 'failed'}`);
    },
    onPlanCreated: (plan) => {
      logger.info(`[Orchestrator] Plan: ${plan.plan.length} steps`);
    },
  });

  beforeAgentRun(settings.operator);

  try {
    const result = await orchestrator.run(instructions);
    setState({
      ...getState(),
      status: result.success ? StatusEnum.END : StatusEnum.ERROR,
      errorMsg: result.success ? null : 'Some steps failed',
    });
  } catch (e) {
    logger.error('[runMultiAgent] error:', e);
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      errorMsg: e instanceof Error ? e.message : String(e),
    });
  } finally {
    afterAgentRun(settings.operator);
  }
};
```

**Step 2: Modify runAgent.ts to dispatch**

At the top of `runAgent()` in `apps/ui-tars/src/main/services/runAgent.ts`, after loading settings (line 40), add:

```typescript
  // Multi-agent mode: use Orchestrator if enabled
  if (settings.multiAgentEnabled) {
    const { runMultiAgent } = await import('./runMultiAgent');
    return runMultiAgent(setState, getState);
  }
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/main/services/runMultiAgent.ts apps/ui-tars/src/main/services/runAgent.ts
git commit -m "feat: integrate multi-agent orchestrator into agent runner"
```

---

## Phase 3: MCP Integration + API Agent

### Task 10: Create MCP server manager

**Files:**
- Create: `apps/ui-tars/src/main/agent/mcp/MCPManager.ts`
- Test: `apps/ui-tars/src/main/agent/mcp/MCPManager.test.ts`

**Context:** The MCP Manager launches and manages MCP server processes. Each server exposes tools that the API Agent can call. Uses `@modelcontextprotocol/sdk` for the client. The manager needs to handle lifecycle (start, discover tools, stop), and expose a unified tool list for the Planner.

This task creates the MCP infrastructure. MCP servers are configured by the user in settings (Phase 5) as `{ name, command, args, env }` entries.

**Step 1: Install MCP SDK dependency**

Run: `cd apps/ui-tars && pnpm add @modelcontextprotocol/sdk`

**Step 2: Write MCPManager**

Create `apps/ui-tars/src/main/agent/mcp/MCPManager.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '@main/logger';

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPTool {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ServerConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: MCPTool[];
}

export class MCPManager {
  private connections = new Map<string, ServerConnection>();

  async connectServer(config: MCPServerConfig): Promise<MCPTool[]> {
    if (this.connections.has(config.name)) {
      return this.connections.get(config.name)!.tools;
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });

    const client = new Client({ name: 'heyworkly', version: '1.0.0' }, {});
    await client.connect(transport);

    // Discover tools
    const toolsResponse = await client.listTools();
    const tools: MCPTool[] = (toolsResponse.tools || []).map((t) => ({
      server: config.name,
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));

    this.connections.set(config.name, { client, transport, tools });
    logger.info(`[MCPManager] Connected to ${config.name}: ${tools.length} tools`);
    return tools;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const conn = this.connections.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not connected`);

    const result = await conn.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const conn of this.connections.values()) {
      tools.push(...conn.tools);
    }
    return tools;
  }

  getToolsSummary(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return 'No MCP tools available.';
    return tools.map((t) => `- ${t.server}/${t.name}: ${t.description}`).join('\n');
  }

  async disconnectServer(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn) {
      await conn.client.close();
      this.connections.delete(name);
      logger.info(`[MCPManager] Disconnected from ${name}`);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnectServer(name);
    }
  }
}
```

**Step 3: Write test**

Create `apps/ui-tars/src/main/agent/mcp/MCPManager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MCPManager } from './MCPManager';

describe('MCPManager', () => {
  it('should initialize with no connections', () => {
    const manager = new MCPManager();
    expect(manager.getAllTools()).toHaveLength(0);
    expect(manager.getToolsSummary()).toBe('No MCP tools available.');
  });
});
```

**Step 4: Run test, commit**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/mcp/MCPManager.test.ts`

```bash
git add apps/ui-tars/src/main/agent/mcp/
git commit -m "feat: add MCP server manager for tool discovery and invocation"
```

---

### Task 11: Create API Agent with MCP tool calling

**Files:**
- Create: `apps/ui-tars/src/main/agent/tools/apiTools.ts`

**Context:** The API Agent calls MCP tools directly. It wraps each discovered MCP tool into an OpenAI function calling tool definition, so the model can call them. Also includes `http_request` and `shell_exec` tools.

**Step 1: Write apiTools.ts**

Create `apps/ui-tars/src/main/agent/tools/apiTools.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolDefinition, ToolHandler } from '@ui-tars/sdk';
import type { MCPManager, MCPTool } from '../mcp/MCPManager';

export function getApiToolDefinitions(mcpTools: MCPTool[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'http_request',
        description: 'Make an HTTP request to any URL.',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
            url: { type: 'string' },
            body: { type: 'string', description: 'JSON string body for POST/PUT/PATCH' },
            headers: { type: 'object', description: 'Request headers' },
          },
          required: ['method', 'url'],
        },
      },
    },
  ];

  // Convert MCP tools to OpenAI function definitions
  for (const mcpTool of mcpTools) {
    tools.push({
      type: 'function',
      function: {
        name: `mcp_${mcpTool.server}_${mcpTool.name}`,
        description: `[${mcpTool.server}] ${mcpTool.description}`,
        parameters: mcpTool.inputSchema as any,
      },
    });
  }

  return tools;
}

export function createApiToolHandlers(mcpManager: MCPManager): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {
    http_request: async (args) => {
      try {
        const resp = await fetch(args.url as string, {
          method: args.method as string,
          body: args.body as string | undefined,
          headers: args.headers as Record<string, string> | undefined,
        });
        const text = await resp.text();
        return {
          success: resp.ok,
          result: { status: resp.status, body: text.slice(0, 5000) },
        };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };

  // Add handlers for each MCP tool
  for (const tool of mcpManager.getAllTools()) {
    const handlerName = `mcp_${tool.server}_${tool.name}`;
    handlers[handlerName] = async (args) => {
      try {
        const result = await mcpManager.callTool(tool.server, tool.name, args);
        return { success: true, result };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    };
  }

  return handlers;
}
```

**Step 2: Commit**

```bash
git add apps/ui-tars/src/main/agent/tools/apiTools.ts
git commit -m "feat: add API agent tools with MCP integration"
```

---

## Phase 4: Memory System

### Task 12: Create SQLite-based memory store

**Files:**
- Create: `apps/ui-tars/src/main/agent/memory/MemoryStore.ts`
- Test: `apps/ui-tars/src/main/agent/memory/MemoryStore.test.ts`

**Context:** Memory persists across sessions using SQLite (via `better-sqlite3`). Stores workflow patterns, element maps, failure corrections, and user preferences. See design doc "5. Memory Agent" section. The Planner queries memory before planning; agents query during execution; Verifier writes after success/failure.

**Step 1: Install dependency**

Run: `cd apps/ui-tars && pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`

**Step 2: Write MemoryStore**

Create `apps/ui-tars/src/main/agent/memory/MemoryStore.ts`:

```typescript
/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

export interface MemoryEntry {
  id?: number;
  type: 'workflow' | 'element_map' | 'failure' | 'preference';
  key: string;
  value: string;
  context?: string;
  created_at?: string;
  updated_at?: string;
  hit_count?: number;
}

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(app.getPath('userData'), 'heyworkly-memory.db');
    this.db = new Database(resolvedPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        context TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        hit_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_memory_type_key ON memory(type, key);
    `);
  }

  save(entry: MemoryEntry): number {
    const existing = this.db.prepare(
      'SELECT id FROM memory WHERE type = ? AND key = ?',
    ).get(entry.type, entry.key) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(
        `UPDATE memory SET value = ?, context = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(entry.value, entry.context ?? null, existing.id);
      return existing.id;
    }

    const result = this.db.prepare(
      'INSERT INTO memory (type, key, value, context) VALUES (?, ?, ?, ?)',
    ).run(entry.type, entry.key, entry.value, entry.context ?? null);

    return result.lastInsertRowid as number;
  }

  query(type: string, key?: string): MemoryEntry[] {
    let stmt;
    if (key) {
      stmt = this.db.prepare(
        'SELECT * FROM memory WHERE type = ? AND key LIKE ? ORDER BY hit_count DESC, updated_at DESC LIMIT 10',
      );
      // Increment hit count
      this.db.prepare(
        'UPDATE memory SET hit_count = hit_count + 1 WHERE type = ? AND key LIKE ?',
      ).run(type, `%${key}%`);
      return stmt.all(type, `%${key}%`) as MemoryEntry[];
    }
    stmt = this.db.prepare(
      'SELECT * FROM memory WHERE type = ? ORDER BY updated_at DESC LIMIT 20',
    );
    return stmt.all(type) as MemoryEntry[];
  }

  getContextForPlanner(instruction: string): string {
    const words = instruction.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const entries: MemoryEntry[] = [];

    for (const word of words.slice(0, 5)) {
      entries.push(...this.query('workflow', word));
      entries.push(...this.query('preference', word));
    }

    if (entries.length === 0) return '';

    const unique = [...new Map(entries.map((e) => [e.id, e])).values()];
    return unique
      .slice(0, 5)
      .map((e) => `[${e.type}] ${e.key}: ${e.value}`)
      .join('\n');
  }

  close() {
    this.db.close();
  }
}
```

**Step 3: Write test**

Create `apps/ui-tars/src/main/agent/memory/MemoryStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from './MemoryStore';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock electron app
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}));

describe('MemoryStore', () => {
  let store: MemoryStore;
  const testDbPath = path.join(os.tmpdir(), `test-memory-${Date.now()}.db`);

  beforeEach(() => {
    store = new MemoryStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.unlinkSync(testDbPath); } catch {}
  });

  it('should save and query memory entries', () => {
    store.save({ type: 'workflow', key: 'book flight', value: 'Use Google Flights' });
    const results = store.query('workflow', 'flight');
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('Use Google Flights');
  });

  it('should update existing entries with same type+key', () => {
    store.save({ type: 'preference', key: 'browser', value: 'Chrome' });
    store.save({ type: 'preference', key: 'browser', value: 'Firefox' });
    const results = store.query('preference', 'browser');
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('Firefox');
  });

  it('should return context for planner', () => {
    store.save({ type: 'workflow', key: 'google flights booking', value: 'Search -> Select -> Book' });
    const context = store.getContextForPlanner('Book a flight on Google');
    expect(context).toContain('google flights');
  });
});
```

**Step 4: Run test, commit**

Run: `pnpm vitest run apps/ui-tars/src/main/agent/memory/MemoryStore.test.ts`

```bash
git add apps/ui-tars/src/main/agent/memory/
git commit -m "feat: add SQLite-based memory store for persistent learning"
```

---

## Phase 5: Settings UI Redesign

### Task 13: Add per-agent model selection to settings UI

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx`
- Modify: `apps/ui-tars/src/renderer/src/components/Settings/global.tsx`

**Context:** Currently `vlm.tsx` has a single model dropdown. We need to add per-agent model fields (Planner, Browser Agent, Desktop Agent, API Agent) that appear when the new `multiAgentEnabled` toggle is on. Each field is a dropdown + text input like the existing model field. The single API key and base URL remain shared.

**Step 1: Add multi-agent toggle and per-agent fields to vlm.tsx**

Extend the form schema in `vlm.tsx:36-43`:

```typescript
const formSchema = z.object({
  vlmProvider: z.union([z.nativeEnum(VLMProviderV2), z.string().min(1)], {
    errorMap: () => ({ message: 'Please select a VLM Provider' }),
  }),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
  // Multi-agent fields
  multiAgentEnabled: z.boolean().optional(),
  plannerModel: z.string().optional(),
  browserAgentModel: z.string().optional(),
  desktopAgentModel: z.string().optional(),
  apiAgentModel: z.string().optional(),
});
```

Add after the Model Name field (after line ~392): a toggle switch for "Multi-Agent Mode" and conditional per-agent model dropdowns that each reuse the `POPULAR_MODELS` list and follow the same select + input pattern as the main model field.

**Step 2: Add "MCP" nav item to global.tsx**

In `global.tsx` NAV_ITEMS (line 31-56), add:
```typescript
  {
    id: 'mcp',
    label: 'MCP Tools',
    icon: Plug, // from lucide-react
    description: 'External service integrations',
  },
```

And render a new section for `activeSection === 'mcp'` with placeholder content for MCP server configuration.

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/Settings/
git commit -m "feat: add per-agent model selection and MCP tab to settings UI"
```

---

### Task 14: Create MCP settings component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/Settings/category/mcp.tsx`

**Context:** This settings tab lets users add MCP server configurations (name, command, args, env vars), see available tools per server, and test connections. MCP servers are stored in settings as an array of `MCPServerConfig` objects.

**Step 1: Add mcpServers field to store**

Extend `validate.ts` PresetSchema:
```typescript
  mcpServers: z.array(z.object({
    name: z.string(),
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string()).optional(),
    enabled: z.boolean().optional(),
  })).optional(),
```

Update `DEFAULT_SETTING` in `setting.ts`:
```typescript
  mcpServers: [],
```

**Step 2: Create mcp.tsx component**

Create `apps/ui-tars/src/renderer/src/components/Settings/category/mcp.tsx` with:
- A list of configured MCP servers with name, command, status
- "Add Server" button with fields: name, command, args, env
- "Test Connection" button per server
- "Remove" button per server
- Gallery of popular servers (Gmail, Slack, GitHub, Notion) with one-click add

**Step 3: Wire into global.tsx**

Import `MCPSettings` component and render it in the `mcp` section.

**Step 4: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/Settings/category/mcp.tsx apps/ui-tars/src/main/store/validate.ts apps/ui-tars/src/main/store/setting.ts apps/ui-tars/src/renderer/src/components/Settings/global.tsx
git commit -m "feat: add MCP tools settings tab with server configuration"
```

---

### Task 15: Add preset quick-select for agent models

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx`

**Context:** Design doc specifies 3 presets: Performance, Balanced, Budget. Each preset auto-fills all 4 agent model fields. Add a preset selector above the per-agent fields that, when selected, fills in the model names.

**Step 1: Add presets data and UI**

In `vlm.tsx`, add:
```typescript
const AGENT_PRESETS = [
  {
    name: 'Performance',
    description: 'Best accuracy, higher cost',
    planner: 'anthropic/claude-opus-4.6',
    browser: 'anthropic/claude-sonnet-4.6',
    desktop: 'anthropic/claude-sonnet-4.6',
    api: 'anthropic/claude-sonnet-4.6',
  },
  {
    name: 'Balanced',
    description: 'Good accuracy, moderate cost',
    planner: 'anthropic/claude-sonnet-4.6',
    browser: 'google/gemini-3-flash-preview',
    desktop: 'anthropic/claude-sonnet-4.6',
    api: 'anthropic/claude-haiku-4.5',
  },
  {
    name: 'Budget',
    description: 'Fast and cheap',
    planner: 'google/gemini-2.5-pro',
    browser: 'google/gemini-2.5-flash',
    desktop: 'qwen/qwen3-vl',
    api: 'qwen/qwen3-235b-a22b',
  },
];
```

Render as 3 cards above the individual model selectors. Clicking a preset calls `form.setValue()` for each field.

**Step 2: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx
git commit -m "feat: add quick-select presets for agent model configuration"
```

---

## Phase Summary

| Task | Phase | What It Creates | Depends On |
|------|-------|----------------|------------|
| 1 | 1 | ToolCallingModel | - |
| 2 | 1 | AgentLoop | Task 1 |
| 3 | 1 | Browser tools | Task 2 |
| 4 | 1 | Desktop tools | Task 2 |
| 5 | 1 | Verifier | - |
| 6 | 1 | Per-agent settings store | - |
| 7 | 2 | PlannerAgent | Task 1 |
| 8 | 2 | Orchestrator | Tasks 2, 7 |
| 9 | 2 | runMultiAgent integration | Tasks 3, 4, 8 |
| 10 | 3 | MCPManager | - |
| 11 | 3 | API Agent tools | Task 10 |
| 12 | 4 | MemoryStore | - |
| 13 | 5 | Settings UI: per-agent models | Task 6 |
| 14 | 5 | Settings UI: MCP tab | Task 10 |
| 15 | 5 | Settings UI: presets | Task 13 |
