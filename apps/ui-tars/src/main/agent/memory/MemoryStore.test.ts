import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStore } from './MemoryStore';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock electron app
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}));

describe('MemoryStore', () => {
  let store: MemoryStore;
  const testDbPath = path.join(os.tmpdir(), `test-memory-${Date.now()}.db`);

  beforeEach(() => {
    store = new MemoryStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // ignore cleanup errors
    }
  });

  it('should save and query memory entries', () => {
    store.save({
      type: 'workflow',
      key: 'book flight',
      value: 'Use Google Flights',
    });
    const results = store.query('workflow', 'flight');
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('Use Google Flights');
  });

  it('should update existing entries with same type+key', () => {
    store.save({ type: 'preference', key: 'browser', value: 'Chrome' });
    store.save({ type: 'preference', key: 'browser', value: 'Firefox' });
    const results = store.query('preference', 'browser');
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('Firefox');
  });

  it('should return context for planner', () => {
    store.save({
      type: 'workflow',
      key: 'google flights booking',
      value: 'Search -> Select -> Book',
    });
    const context = store.getContextForPlanner('Book a flight on Google');
    expect(context).toContain('google flights');
  });

  it('should return empty context for unknown instructions', () => {
    const context = store.getContextForPlanner('do something random');
    expect(context).toBe('');
  });

  it('should query all entries by type', () => {
    store.save({ type: 'workflow', key: 'task1', value: 'value1' });
    store.save({ type: 'workflow', key: 'task2', value: 'value2' });
    store.save({ type: 'preference', key: 'pref1', value: 'value3' });

    const workflows = store.query('workflow');
    expect(workflows).toHaveLength(2);

    const prefs = store.query('preference');
    expect(prefs).toHaveLength(1);
  });
});
