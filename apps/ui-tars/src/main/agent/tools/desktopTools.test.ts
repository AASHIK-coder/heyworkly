import { describe, it, expect, vi } from 'vitest';
import {
  getDesktopToolDefinitions,
  createDesktopToolHandlers,
} from './desktopTools';

describe('desktopTools', () => {
  describe('getDesktopToolDefinitions', () => {
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

    it('should have 9 tools', () => {
      const tools = getDesktopToolDefinitions();
      expect(tools).toHaveLength(9);
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

  describe('createDesktopToolHandlers', () => {
    const mockDeps = {
      screenshot: vi.fn().mockResolvedValue({ base64: 'abc', scaleFactor: 1 }),
      click: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
      hotkey: vi.fn().mockResolvedValue(undefined),
      scroll: vi.fn().mockResolvedValue(undefined),
      drag: vi.fn().mockResolvedValue(undefined),
    };

    it('should call click handler with coordinates', async () => {
      const handlers = createDesktopToolHandlers(mockDeps);
      const result = await handlers.gui_click({ x: 100, y: 200 });
      expect(result.success).toBe(true);
      expect(mockDeps.click).toHaveBeenCalledWith(100, 200, {
        button: undefined,
        double: undefined,
      });
    });

    it('should call type handler', async () => {
      const handlers = createDesktopToolHandlers(mockDeps);
      const result = await handlers.gui_type({ text: 'hello world' });
      expect(result.success).toBe(true);
      expect(mockDeps.type).toHaveBeenCalledWith('hello world');
    });

    it('should call hotkey handler with split keys', async () => {
      const handlers = createDesktopToolHandlers(mockDeps);
      const result = await handlers.gui_hotkey({ keys: 'ctrl c' });
      expect(result.success).toBe(true);
      expect(mockDeps.hotkey).toHaveBeenCalledWith(['ctrl', 'c']);
    });

    it('should call screenshot handler', async () => {
      const handlers = createDesktopToolHandlers(mockDeps);
      const result = await handlers.screenshot({});
      expect(result.success).toBe(true);
      expect(mockDeps.screenshot).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const errorDeps = {
        ...mockDeps,
        click: vi.fn().mockRejectedValue(new Error('Click failed')),
      };
      const handlers = createDesktopToolHandlers(errorDeps);
      const result = await handlers.gui_click({ x: 0, y: 0 });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Click failed');
    });
  });
});
