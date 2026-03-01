import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolCallingModel, type ToolDefinition } from '../src/ToolCallingModel';

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
            target: {
              type: 'string',
              description: 'CSS selector or "x,y" coordinates',
            },
          },
          required: ['target'],
        },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send tools parameter in the API call', async () => {
    const openaiModule = await import('openai');
    const mockCreate = (openaiModule as any).__mockCreate;
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'gui_click', arguments: '{"target":"#btn"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { total_tokens: 100 },
    });

    const model = new ToolCallingModel({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });

    const result = await model.invokeWithTools({
      messages: [{ role: 'user', content: 'Click the submit button' }],
      tools,
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].function.name).toBe('gui_click');
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({
      target: '#btn',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tools }),
      expect.anything(),
    );
  });

  it('should return text content when model responds without tool calls', async () => {
    const openaiModule = await import('openai');
    const mockCreate = (openaiModule as any).__mockCreate;
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: 'Task is complete', tool_calls: undefined },
          finish_reason: 'stop',
        },
      ],
      usage: { total_tokens: 50 },
    });

    const model = new ToolCallingModel({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });

    const result = await model.invokeWithTools({
      messages: [{ role: 'user', content: 'Done?' }],
      tools,
    });

    expect(result.toolCalls).toHaveLength(0);
    expect(result.textContent).toBe('Task is complete');
  });
});
