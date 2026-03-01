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
2. You MUST ONLY assign agents from the Available Agents list above. Do NOT use agents that are not listed.
3. Assign each subtask to the most appropriate available agent:
   - **desktop**: Native app tasks AND web browsing (open browser, navigate, click, type, file operations, system interactions). Use this for web tasks when **browser** agent is not available.
   - **browser**: Web tasks (search, navigate, fill forms, extract data) — only if listed above.
   - **api**: Direct service calls when MCP tools are available (email, messaging, databases) — only if listed above.
4. Prefer **api** agent when an MCP tool exists for the service — it's faster and more reliable than GUI.
4. Set \`depends_on\` to enforce execution order. Independent tasks can run in parallel.
5. Set \`verify: true\` for actions that must succeed before continuing.
6. If the task is simple (single agent, 1-2 steps), still create a plan — just make it short.

${params.mcpToolsSummary ? `## Available MCP Tools\n${params.mcpToolsSummary}\n` : ''}
${params.memoryContext ? `## Relevant Memory\n${params.memoryContext}\n` : ''}
${params.currentState ? `## Current System State\n${params.currentState}\n` : ''}

Use the create_plan tool to output your execution plan.`;
}

export function getPlannerToolDefinition(availableAgents?: string[]) {
  const agentEnum =
    availableAgents && availableAgents.length > 0
      ? availableAgents
      : ['browser', 'desktop', 'api'];
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
            description:
              'Brief explanation of why you chose this plan structure.',
          },
          plan: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Step ID (1-indexed)' },
                agent: { type: 'string', enum: agentEnum },
                task: {
                  type: 'string',
                  description: 'Clear, actionable subtask description',
                },
                depends_on: {
                  type: 'array',
                  items: { type: 'number' },
                  description:
                    'IDs of steps that must complete before this one',
                },
                verify: {
                  type: 'boolean',
                  description: 'Whether to verify this step succeeded',
                },
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
