import { describe, it, expect, vi } from 'vitest';
import {
  getBrowserToolDefinitions,
  createBrowserToolHandlers,
} from './browserTools';

describe('browserTools', () => {
  describe('getBrowserToolDefinitions', () => {
    it('should return tool definitions with correct names', () => {
      const tools = getBrowserToolDefinitions();
      const names = tools.map((t) => t.function.name);
      expect(names).toContain('gui_click');
      expect(names).toContain('gui_type');
      expect(names).toContain('gui_scroll');
      expect(names).toContain('gui_hotkey');
      expect(names).toContain('dom_query');
      expect(names).toContain('dom_getText');
      expect(names).toContain('js_evaluate');
      expect(names).toContain('page_navigate');
      expect(names).toContain('page_waitFor');
      expect(names).toContain('screenshot');
    });

    it('all tools should have valid function schemas', () => {
      const tools = getBrowserToolDefinitions();
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function.name).toBeTruthy();
        expect(tool.function.description).toBeTruthy();
        expect(tool.function.parameters).toBeTruthy();
      }
    });

    it('should have 10 tools', () => {
      const tools = getBrowserToolDefinitions();
      expect(tools).toHaveLength(10);
    });
  });

  describe('createBrowserToolHandlers', () => {
    it('should return error when no page is available', async () => {
      const handlers = createBrowserToolHandlers(() => null);
      const result = await handlers.gui_click({ selector: '#test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active page');
    });

    it('should call page.$$ for dom_query', async () => {
      const mockPage = {
        $$: vi.fn().mockResolvedValue([]),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.dom_query({ selector: '#test' });
      expect(result.success).toBe(true);
      expect(mockPage.$$).toHaveBeenCalledWith('#test');
    });

    it('should call page.click for gui_click with selector', async () => {
      const mockPage = {
        click: vi.fn().mockResolvedValue(undefined),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_click({ selector: '.btn' });
      expect(result.success).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('.btn');
    });

    it('should call page.mouse.click for gui_click with coordinates', async () => {
      const mockPage = {
        mouse: { click: vi.fn().mockResolvedValue(undefined) },
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_click({ x: 100, y: 200 });
      expect(result.success).toBe(true);
      expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200);
    });

    it('should call page.goto for page_navigate', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.page_navigate({
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.anything(),
      );
    });

    it('should call page.keyboard.type for gui_type', async () => {
      const mockPage = {
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
          press: vi.fn().mockResolvedValue(undefined),
        },
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_type({ text: 'hello' });
      expect(result.success).toBe(true);
      expect(mockPage.keyboard.type).toHaveBeenCalledWith('hello');
    });

    it('should focus element before typing when selector is provided', async () => {
      const mockPage = {
        click: vi.fn().mockResolvedValue(undefined),
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
          press: vi.fn().mockResolvedValue(undefined),
        },
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_type({
        text: 'hello',
        selector: '#input',
      });
      expect(result.success).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('#input');
      expect(mockPage.keyboard.type).toHaveBeenCalledWith('hello');
    });

    it('should press Enter after typing when pressEnter is true', async () => {
      const mockPage = {
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
          press: vi.fn().mockResolvedValue(undefined),
        },
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_type({
        text: 'search query',
        pressEnter: true,
      });
      expect(result.success).toBe(true);
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });

    it('should call page.mouse.wheel for gui_scroll', async () => {
      const mockPage = {
        mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_scroll({ direction: 'down' });
      expect(result.success).toBe(true);
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith({
        deltaX: 0,
        deltaY: 300,
      });
    });

    it('should handle screenshot', async () => {
      const mockPage = {
        screenshot: vi.fn().mockResolvedValue('base64data'),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.screenshot({});
      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        encoding: 'base64',
        type: 'jpeg',
        quality: 75,
      });
    });

    it('should return error when gui_click has no selector or coordinates', async () => {
      const mockPage = {};
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.gui_click({});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Provide selector or x,y coordinates');
    });

    it('should return error when dom_getText element not found', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue(null),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.dom_getText({
        selector: '#nonexistent',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
    });

    it('should call page.waitForSelector for page_waitFor', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.page_waitFor({
        selector: '.loaded',
        timeout: 3000,
      });
      expect(result.success).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loaded', {
        timeout: 3000,
      });
    });

    it('should call page.evaluate for js_evaluate', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue('result'),
      };
      const handlers = createBrowserToolHandlers(() => mockPage as any);
      const result = await handlers.js_evaluate({
        code: 'document.title',
      });
      expect(result.success).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalledWith('document.title');
    });
  });
});
