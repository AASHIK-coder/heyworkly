import { describe, it, expect, vi } from 'vitest';
import { PlannerAgent } from './PlannerAgent';

vi.mock('@main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('PlannerAgent', () => {
  it('should parse a plan from model tool call', async () => {
    const mockModel = {
      invokeWithTools: vi.fn().mockResolvedValue({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'create_plan',
              arguments: JSON.stringify({
                reasoning: 'Need to search then email',
                plan: [
                  {
                    id: 1,
                    agent: 'browser',
                    task: 'Search for flights',
                    depends_on: [],
                    verify: true,
                  },
                  {
                    id: 2,
                    agent: 'api',
                    task: 'Send email with results',
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
