/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

export interface MemoryEntry {
  id?: number;
  type: 'workflow' | 'element_map' | 'failure' | 'preference';
  key: string;
  value: string;
  context?: string;
  created_at?: string;
  updated_at?: string;
  hit_count?: number;
}

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath || path.join(app.getPath('userData'), 'heyworkly-memory.db');
    this.db = new Database(resolvedPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        context TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        hit_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_memory_type_key ON memory(type, key);
    `);
  }

  save(entry: MemoryEntry): number {
    const existing = this.db
      .prepare('SELECT id FROM memory WHERE type = ? AND key = ?')
      .get(entry.type, entry.key) as { id: number } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE memory SET value = ?, context = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(entry.value, entry.context ?? null, existing.id);
      return existing.id;
    }

    const result = this.db
      .prepare(
        'INSERT INTO memory (type, key, value, context) VALUES (?, ?, ?, ?)',
      )
      .run(entry.type, entry.key, entry.value, entry.context ?? null);

    return result.lastInsertRowid as number;
  }

  query(type: string, key?: string): MemoryEntry[] {
    if (key) {
      // Increment hit count
      this.db
        .prepare(
          'UPDATE memory SET hit_count = hit_count + 1 WHERE type = ? AND key LIKE ?',
        )
        .run(type, `%${key}%`);
      return this.db
        .prepare(
          'SELECT * FROM memory WHERE type = ? AND key LIKE ? ORDER BY hit_count DESC, updated_at DESC LIMIT 10',
        )
        .all(type, `%${key}%`) as MemoryEntry[];
    }
    return this.db
      .prepare(
        'SELECT * FROM memory WHERE type = ? ORDER BY updated_at DESC LIMIT 20',
      )
      .all(type) as MemoryEntry[];
  }

  getContextForPlanner(instruction: string): string {
    const words = instruction
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const entries: MemoryEntry[] = [];

    for (const word of words.slice(0, 5)) {
      entries.push(...this.query('workflow', word));
      entries.push(...this.query('preference', word));
    }

    if (entries.length === 0) return '';

    const unique = [...new Map(entries.map((e) => [e.id, e])).values()];
    return unique
      .slice(0, 5)
      .map((e) => `[${e.type}] ${e.key}: ${e.value}`)
      .join('\n');
  }

  close() {
    this.db.close();
  }
}
