/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { Plus, Trash2, Server } from 'lucide-react';

import { useSetting } from '@renderer/hooks/useSetting';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import { cn } from '@renderer/utils';

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

const POPULAR_SERVERS: Omit<MCPServerConfig, 'env'>[] = [
  {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    enabled: true,
  },
  {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    enabled: true,
  },
  {
    name: 'slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    enabled: true,
  },
];

export function MCPSettings({ className }: { className?: string }) {
  const { settings, updateSetting } = useSetting();
  const servers: MCPServerConfig[] = (settings as any).mcpServers || [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState<MCPServerConfig>({
    name: '',
    command: '',
    args: [],
    enabled: true,
  });

  const updateServers = (updated: MCPServerConfig[]) => {
    updateSetting({ ...settings, mcpServers: updated } as any);
  };

  const addServer = (server: MCPServerConfig) => {
    if (!server.name || !server.command) return;
    updateServers([...servers, server]);
    setNewServer({ name: '', command: '', args: [], enabled: true });
    setShowAddForm(false);
  };

  const removeServer = (index: number) => {
    updateServers(servers.filter((_, i) => i !== index));
  };

  const toggleServer = (index: number) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    updateServers(updated);
  };

  return (
    <div className={cn('space-y-5', className)}>
      {/* Server List */}
      {servers.length > 0 && (
        <div className="space-y-2">
          {servers.map((server, i) => (
            <div
              key={`${server.name}-${i}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border"
            >
              <Server
                size={16}
                className="text-muted-foreground flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{server.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {server.command} {server.args.join(' ')}
                </p>
              </div>
              <Switch
                checked={server.enabled !== false}
                onCheckedChange={() => toggleServer(i)}
              />
              <button
                onClick={() => removeServer(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {servers.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-muted-foreground">
          <Server size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No MCP servers configured</p>
          <p className="text-xs mt-1">
            Add servers to enable API integrations (Gmail, Slack, GitHub, etc.)
          </p>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
          <div>
            <Label className="text-xs">Server Name</Label>
            <Input
              placeholder="e.g. github"
              value={newServer.name}
              onChange={(e) =>
                setNewServer({ ...newServer, name: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Command</Label>
            <Input
              placeholder="e.g. npx"
              value={newServer.command}
              onChange={(e) =>
                setNewServer({ ...newServer, command: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Arguments (space-separated)</Label>
            <Input
              placeholder="e.g. -y @modelcontextprotocol/server-github"
              value={newServer.args.join(' ')}
              onChange={(e) =>
                setNewServer({
                  ...newServer,
                  args: e.target.value.split(' ').filter(Boolean),
                })
              }
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => addServer(newServer)}
              disabled={!newServer.name || !newServer.command}
            >
              Add Server
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showAddForm && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={14} className="mr-1.5" />
          Add Server
        </Button>
      )}

      {/* Quick-Add Gallery */}
      <div className="border-t border-border pt-4">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Popular Servers
        </Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {POPULAR_SERVERS.filter(
            (ps) => !servers.some((s) => s.name === ps.name),
          ).map((ps) => (
            <button
              key={ps.name}
              type="button"
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-center"
              onClick={() => addServer({ ...ps, enabled: true })}
            >
              <Server size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium capitalize">{ps.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
