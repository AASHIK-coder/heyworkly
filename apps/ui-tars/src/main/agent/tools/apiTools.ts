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
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            url: { type: 'string' },
            body: {
              type: 'string',
              description: 'JSON string body for POST/PUT/PATCH',
            },
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
        parameters: mcpTool.inputSchema as Record<string, unknown>,
      },
    });
  }

  return tools;
}

export function createApiToolHandlers(
  mcpManager: MCPManager,
): Record<string, ToolHandler> {
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
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
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
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    };
  }

  return handlers;
}
