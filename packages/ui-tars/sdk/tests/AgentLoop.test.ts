import { describe, it, expect, vi } from 'vitest';
import { AgentLoop, type ToolHandler } from '../src/AgentLoop';
import type { ToolCallingModel } from '../src/ToolCallingModel';

describe('AgentLoop', () => {
  it('should execute tool calls and feed results back to model', async () => {
    const mockModel = {
      invokeWithTools: vi
        .fn()
        // First call: model returns a tool call
        .mockResolvedValueOnce({
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'gui_click', arguments: '{"target":"#btn"}' },
            },
          ],
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
      tools: [
        {
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
        },
      ],
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
    expect(result.stoppedReason).toBe('completed');
    expect(mockModel.invokeWithTools).toHaveBeenCalledTimes(2);
  });

  it('should stop after maxIterations', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'noop', arguments: '{}' },
          },
        ],
        textContent: null,
        finishReason: 'tool_calls',
        costTokens: 10,
      }),
      modelName: 'test-model',
    } as unknown as ToolCallingModel;

    const loop = new AgentLoop({
      model: mockModel,
      tools: [
        {
          type: 'function',
          function: {
            name: 'noop',
            description: 'noop',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
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

  it('should handle unknown tool gracefully', async () => {
    const mockModel = {
      invokeWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'unknown_tool', arguments: '{}' },
            },
          ],
          textContent: null,
          finishReason: 'tool_calls',
          costTokens: 10,
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          textContent: 'Done',
          finishReason: 'stop',
          costTokens: 10,
        }),
      modelName: 'test-model',
    } as unknown as ToolCallingModel;

    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    const loop = new AgentLoop({
      model: mockModel,
      tools: [],
      toolHandlers: {},
      logger: mockLogger,
    });

    const result = await loop.run({
      systemPrompt: 'test',
      userMessage: 'call unknown tool',
    });

    expect(result.stoppedReason).toBe('completed');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown tool'),
    );
  });

  it('should include images in user message when provided', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [],
        textContent: 'I see the image',
        finishReason: 'stop',
        costTokens: 50,
      }),
      modelName: 'test-model',
    } as unknown as ToolCallingModel;

    const loop = new AgentLoop({
      model: mockModel,
      tools: [],
      toolHandlers: {},
    });

    const result = await loop.run({
      systemPrompt: 'You are an agent.',
      userMessage: 'What do you see?',
      images: ['base64data'],
    });

    expect(result.stoppedReason).toBe('completed');
    // Verify the messages sent to model include image content
    const invokeCall = mockModel.invokeWithTools.mock.calls[0][0];
    const userMsg = invokeCall.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[1].type).toBe('image_url');
  });
});
