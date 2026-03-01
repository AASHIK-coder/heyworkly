import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from './Orchestrator';

vi.mock('@main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Orchestrator', () => {
  it('should create plan and execute steps in order', async () => {
    const mockPlannerModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'create_plan',
              arguments: JSON.stringify({
                reasoning: 'Simple search task',
                plan: [
                  {
                    id: 1,
                    agent: 'browser',
                    task: 'Search Google',
                    depends_on: [],
                    verify: true,
                  },
                  {
                    id: 2,
                    agent: 'browser',
                    task: 'Extract results',
                    depends_on: [1],
                    verify: true,
                  },
                ],
              }),
            },
          },
        ],
        textContent: null,
        finishReason: 'tool_calls',
      }),
      modelName: 'planner-model',
    };

    const mockBrowserLoop = {
      run: vi
        .fn()
        .mockResolvedValueOnce({
          finalText: 'Searched Google',
          iterations: 3,
          stoppedReason: 'completed',
          totalTokens: 100,
          messages: [],
        })
        .mockResolvedValueOnce({
          finalText: 'Found 5 results',
          iterations: 2,
          stoppedReason: 'completed',
          totalTokens: 80,
          messages: [],
        }),
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
