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
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...config.env }).filter(
          (entry): entry is [string, string] => entry[1] != null,
        ),
      ),
    });

    const client = new Client(
      { name: 'heyworkly', version: '1.0.0' },
      { capabilities: {} },
    );
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
    logger.info(
      `[MCPManager] Connected to ${config.name}: ${tools.length} tools`,
    );
    return tools;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const conn = this.connections.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not connected`);

    const result = await conn.client.callTool({
      name: toolName,
      arguments: args,
    });
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
    return tools
      .map((t) => `- ${t.server}/${t.name}: ${t.description}`)
      .join('\n');
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
