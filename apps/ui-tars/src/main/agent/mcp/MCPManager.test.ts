import { describe, it, expect } from 'vitest';
import { MCPManager } from './MCPManager';

describe('MCPManager', () => {
  it('should initialize with no connections', () => {
    const manager = new MCPManager();
    expect(manager.getAllTools()).toHaveLength(0);
    expect(manager.getToolsSummary()).toBe('No MCP tools available.');
  });

  it('should throw when calling tool on unconnected server', async () => {
    const manager = new MCPManager();
    await expect(manager.callTool('nonexistent', 'tool', {})).rejects.toThrow(
      'MCP server "nonexistent" not connected',
    );
  });

  it('should no-op when disconnecting unknown server', async () => {
    const manager = new MCPManager();
    await expect(manager.disconnectServer('unknown')).resolves.toBeUndefined();
  });

  it('should no-op when disconnecting all with no connections', async () => {
    const manager = new MCPManager();
    await expect(manager.disconnectAll()).resolves.toBeUndefined();
  });
});
