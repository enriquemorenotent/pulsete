import {
  defaultWorkspacePreferences,
  workspacePreferencesSchema,
  type WorkspacePreferences,
  type WorkspacePreferencesPatch,
} from '../shared/protocol-preferences.js';
import type { SqliteDb } from './storage-sqlite.js';
import { runInTransaction } from './storage-db.js';

type PreferenceRow = {
  value: string;
  legacyBrowserImported: number;
};

export class StoragePreferencesRepository {
  constructor(private readonly db: SqliteDb) {}

  get(): WorkspacePreferences {
    const row = this.readRow();
    const preferences = parseStoredPreferences(row?.value);
    const next = this.removeMissingNetworkReferences(preferences);
    if (JSON.stringify(next) !== JSON.stringify(preferences)) {
      this.write(next);
    }
    return next;
  }

  update(patch: WorkspacePreferencesPatch): WorkspacePreferences {
    const preferences = this.removeMissingNetworkReferences(workspacePreferencesSchema.parse({
      ...this.get(),
      ...patch,
    }));
    this.write(preferences);
    return preferences;
  }

  replace(preferences: WorkspacePreferences): WorkspacePreferences {
    const parsed = this.removeMissingNetworkReferences(
      workspacePreferencesSchema.parse(preferences),
    );
    this.write(parsed);
    return parsed;
  }

  isLegacyBrowserImportPending() {
    return this.readRow()?.legacyBrowserImported !== 1;
  }

  markLegacyBrowserImported() {
    this.db.prepare(`UPDATE workspace_preferences
      SET legacyBrowserImported = 1, updatedAt = ?
      WHERE id = 1`).run(Date.now());
  }

  transaction<T>(task: () => T) {
    return runInTransaction(this.db, task);
  }

  private readRow() {
    return this.db.prepare(`SELECT value, legacyBrowserImported
      FROM workspace_preferences WHERE id = 1`).get() as PreferenceRow | undefined;
  }

  private write(preferences: WorkspacePreferences) {
    this.db.prepare(`UPDATE workspace_preferences SET value = ?, updatedAt = ? WHERE id = 1`)
      .run(JSON.stringify(preferences), Date.now());
  }

  private removeMissingNetworkReferences(preferences: WorkspacePreferences) {
    const networkIds = new Set(
      (this.db.prepare('SELECT id FROM networks').all() as Array<{ id: string }>)
        .map(({ id }) => id),
    );
    const contactNotifications = {
      ...preferences.contactNotifications,
      contacts: preferences.contactNotifications.contacts.filter(({ networkId }) => networkIds.has(networkId)),
      channels: preferences.contactNotifications.channels.filter(({ networkId }) => networkIds.has(networkId)),
    };
    const serverSidebarAccordions = Object.fromEntries(
      Object.entries(preferences.serverSidebarAccordions)
        .filter(([networkId]) => networkIds.has(networkId)),
    );
    const next = {
      ...preferences,
      contactNotifications,
      serverSidebarAccordions,
    };
    return next;
  }
}

const parseStoredPreferences = (value: string | null | undefined) => {
  if (!value) {
    return defaultWorkspacePreferences;
  }
  try {
    const result = workspacePreferencesSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : defaultWorkspacePreferences;
  } catch {
    return defaultWorkspacePreferences;
  }
};
