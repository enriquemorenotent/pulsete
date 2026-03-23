import type { DatabaseSync } from 'node:sqlite';
import { defaultAssistantModel } from '../shared/assistant-defaults.js';
import type { AssistantPreferences } from '../shared/protocol.js';
import type {
  AssistantPreferencesRow,
  AssistantThreadInput,
  AssistantThreadRow,
} from './storage-types.js';

const preferencesId = 1;

export class StorageAssistantRepository {
  constructor(private readonly db: DatabaseSync) {}

  listThreads() {
    return (this.db.prepare(`
      SELECT id, bufferId, networkId, target, title, task, model, turnStatus, createdAt, updatedAt
      FROM assistant_threads
      ORDER BY updatedAt DESC, createdAt DESC
    `).all() as AssistantThreadRow[]).map(mapThreadRow);
  }

  getThread(threadId: string) {
    const row = this.db.prepare(`
      SELECT id, bufferId, networkId, target, title, task, model, turnStatus, createdAt, updatedAt
      FROM assistant_threads
      WHERE id = ?
    `).get(threadId) as AssistantThreadRow | undefined;
    return row ? mapThreadRow(row) : null;
  }

  upsertThread(input: AssistantThreadInput) {
    const now = Date.now();
    const createdAt = input.createdAt ?? this.getThread(threadIdOrThrow(input.id))?.createdAt ?? now;
    this.db.prepare(`
      INSERT INTO assistant_threads (
        id, bufferId, networkId, target, title, task, model, turnStatus, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        bufferId = excluded.bufferId,
        networkId = excluded.networkId,
        target = excluded.target,
        title = excluded.title,
        task = excluded.task,
        model = excluded.model,
        turnStatus = excluded.turnStatus,
        updatedAt = excluded.updatedAt
    `).run(
      input.id,
      input.bufferId,
      input.networkId,
      input.target,
      input.title,
      input.task,
      input.model,
      input.turnStatus,
      createdAt,
      input.updatedAt ?? now
    );
    return this.getThread(input.id);
  }

  removeThread(threadId: string) {
    this.db.prepare('DELETE FROM assistant_threads WHERE id = ?').run(threadId);
    const preferences = this.getPreferences();
    if (preferences.activeThreadId === threadId) {
      this.savePreferences({ ...preferences, activeThreadId: null });
    }
  }

  getPreferences(): AssistantPreferences {
    const row = this.db.prepare(`
      SELECT id, defaultModel, activeThreadId, createdAt, updatedAt
      FROM assistant_preferences
      WHERE id = ?
    `).get(preferencesId) as AssistantPreferencesRow | undefined;
    if (!row) {
      this.savePreferences({
        defaultModel: defaultAssistantModel,
        activeThreadId: null,
      });
      return {
        defaultModel: defaultAssistantModel,
        activeThreadId: null,
      };
    }
    return {
      defaultModel: row.defaultModel,
      activeThreadId: row.activeThreadId,
    };
  }

  savePreferences(input: AssistantPreferences) {
    const now = Date.now();
    const existing = this.db.prepare(`
      SELECT id, defaultModel, activeThreadId, createdAt, updatedAt
      FROM assistant_preferences
      WHERE id = ?
    `).get(preferencesId) as AssistantPreferencesRow | undefined;
    this.db.prepare(`
      INSERT INTO assistant_preferences (id, defaultModel, activeThreadId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        defaultModel = excluded.defaultModel,
        activeThreadId = excluded.activeThreadId,
        updatedAt = excluded.updatedAt
    `).run(
      preferencesId,
      input.defaultModel,
      input.activeThreadId,
      existing?.createdAt ?? now,
      now
    );
    return this.getPreferences();
  }
}

const mapThreadRow = (row: AssistantThreadRow) => ({
  id: row.id,
  bufferId: row.bufferId,
  networkId: row.networkId,
  target: row.target,
  title: row.title,
  task: row.task,
  model: row.model,
  turnStatus: row.turnStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const threadIdOrThrow = (threadId: string) => {
  if (!threadId) {
    throw new Error('Assistant thread id is required');
  }
  return threadId;
};
