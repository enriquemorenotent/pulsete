import type WebSocket from 'ws';
import { appSnapshotSchema } from '../shared/protocol-app.js';
import type { ClientMessage } from '../shared/protocol-messages.js';
import { badRequest } from './app-error.js';
import { createRuntime, type Runtime, type RuntimeHttpApi } from './runtime.js';
import { Storage } from './storage.js';
import {
  prepareStorageBackupRestore,
  type PreparedStorageRestore,
} from './storage-backup.js';
import { resolveAppPaths, type AppPaths } from './app-paths.js';
import type { RuntimeWebSocketApi } from './runtime-service-types.js';
import type { BackupHttpApi } from './http-types.js';

export class RuntimeHost {
  private readonly paths: AppPaths;
  private storage: Storage;
  private runtime: Runtime;
  readonly http: RuntimeHttpApi & { backups: BackupHttpApi };
  readonly ws: RuntimeWebSocketApi;

  constructor(paths: AppPaths | string) {
    this.paths = typeof paths === 'string' ? resolveAppPaths({ databasePath: paths }) : paths;
    const current = this.openRuntime();
    this.storage = current.storage;
    this.runtime = current.runtime;
    this.http = this.createHttpApi();
    this.ws = this.createWebSocketApi();
  }

  currentStorage() {
    return this.storage;
  }

  close() {
    this.runtime.gateway.close();
    this.storage.close();
  }

  private openRuntime(paths = this.paths) {
    const storage = new Storage(paths);
    try {
      return {
        runtime: createRuntime(storage.runtimeStore),
        storage,
      };
    } catch (error) {
      storage.close();
      throw error;
    }
  }

  private restore(backupContent: Buffer) {
    const prepared = prepareStorageBackupRestore({ backupContent, paths: this.paths });
    try {
      this.validateRestoreCandidate(prepared);
      const replacement = prepared.stageReplacement();
      try {
        this.close();
        replacement.activate();
        let current: ReturnType<RuntimeHost['openRuntime']> | null = null;
        try {
          current = this.openRuntime();
          this.assertRuntimeHealthy(current);
          replacement.commit();
          this.storage = current.storage;
          this.runtime = current.runtime;
          current = null;
        } catch (error) {
          if (current) {
            this.closeOpenedRuntime(current);
          }
          replacement.rollback();
          const previous = this.openRuntime();
          this.storage = previous.storage;
          this.runtime = previous.runtime;
          throw error;
        }
      } finally {
        replacement.dispose();
      }
      return { browserPreferences: prepared.browserPreferences };
    } finally {
      prepared.dispose();
    }
  }

  private validateRestoreCandidate(prepared: PreparedStorageRestore) {
    let candidate: ReturnType<RuntimeHost['openRuntime']> | null = null;
    try {
      candidate = this.openRuntime(prepared.paths);
      this.assertRuntimeHealthy(candidate);
      const validatedCandidate = candidate;
      candidate = null;
      this.closeOpenedRuntime(validatedCandidate);
      prepared.validateDatabase();
    } catch {
      throw badRequest('Invalid backup database');
    } finally {
      if (candidate) {
        this.closeOpenedRuntime(candidate);
      }
    }
  }

  private assertRuntimeHealthy(current: ReturnType<RuntimeHost['openRuntime']>) {
    for (const network of current.storage.networks.list()) {
      current.storage.networks.getRuntime(network.id);
    }
    appSnapshotSchema.parse(current.runtime.ws.snapshot());
  }

  private closeOpenedRuntime(current: ReturnType<RuntimeHost['openRuntime']>) {
    current.runtime.gateway.close();
    current.storage.close();
  }

  private createHttpApi(): RuntimeHost['http'] {
    return {
      assistant: {
        ask: (bufferId, request) => this.runtime.http.assistant.ask(bufferId, request),
        startLogin: () => this.runtime.http.assistant.startLogin(),
        status: () => this.runtime.http.assistant.status(),
      },
      networks: {
        list: () => this.runtime.http.networks.list(),
        save: (data, networkId) => this.runtime.http.networks.save(data, networkId),
        duplicate: (networkId) => this.runtime.http.networks.duplicate(networkId),
        remove: (networkId) => this.runtime.http.networks.remove(networkId),
        close: (networkId) => this.runtime.http.networks.close(networkId),
        connect: (networkId) => this.runtime.http.networks.connect(networkId),
        disconnect: (networkId) => this.runtime.http.networks.disconnect(networkId),
      },
      buffers: {
        joinChannel: (networkId, channel, sourceBufferId) =>
          this.runtime.http.buffers.joinChannel(networkId, channel, sourceBufferId),
        openQuery: (networkId, target, peerIdentity) =>
          this.runtime.http.buffers.openQuery(networkId, target, peerIdentity),
        close: (bufferId) => this.runtime.http.buffers.close(bufferId),
        clearHistory: (bufferId) => this.runtime.http.buffers.clearHistory(bufferId),
        markRead: (bufferId) => this.runtime.http.buffers.markRead(bufferId),
        saveNotes: (bufferId, notes) => this.runtime.http.buffers.saveNotes(bufferId, notes),
        history: (bufferId, limit, beforeMessageId) =>
          this.runtime.http.buffers.history(bufferId, limit, beforeMessageId),
        searchHistory: (bufferId, query, limit) =>
          this.runtime.http.buffers.searchHistory(bufferId, query, limit),
        exportHistory: (bufferId) => this.runtime.http.buffers.exportHistory(bufferId),
        listPinnedMessages: (bufferId) => this.runtime.http.buffers.listPinnedMessages(bufferId),
        setMessagePinned: (bufferId, messageId, pinned) =>
          this.runtime.http.buffers.setMessagePinned(bufferId, messageId, pinned),
        pinnedMessageHistoryWindow: (bufferId, messageId) =>
          this.runtime.http.buffers.pinnedMessageHistoryWindow(bufferId, messageId),
      },
      logs: {
        listSources: (filters, limit) => this.runtime.http.logs.listSources(filters, limit),
        search: (query, limit, filters) => this.runtime.http.logs.search(query, limit, filters),
      },
      friends: {
        add: (nick) => this.runtime.http.friends.add(nick),
        remove: (friendId) => this.runtime.http.friends.remove(friendId),
      },
      nickEmojis: {
        save: (networkId, nick, emoji, identity) =>
          this.runtime.http.nickEmojis.save(networkId, nick, emoji, identity),
      },
      mutedNicks: {
        add: (networkId, nick, identity) => this.runtime.http.mutedNicks.add(networkId, nick, identity),
        remove: (mutedNickId) => this.runtime.http.mutedNicks.remove(mutedNickId),
      },
      preferences: {
        update: (patch) => this.runtime.http.preferences.update(patch),
        importLegacy: (patch, avatars) => this.runtime.http.preferences.importLegacy(patch, avatars),
      },
      drafts: {
        save: (bufferId, body) => this.runtime.http.drafts.save(bufferId, body),
      },
      avatarOverrides: {
        upsert: (input) => this.runtime.http.avatarOverrides.upsert(input),
        remove: (id) => this.runtime.http.avatarOverrides.remove(id),
        source: (id) => this.runtime.http.avatarOverrides.source(id),
      },
      backups: {
        export: (browserPreferences) => this.storage.exportBackup(browserPreferences),
        import: (backupContent) => this.restore(backupContent),
      },
    };
  }

  private createWebSocketApi(): RuntimeWebSocketApi {
    return {
      attachSocket: (ws: WebSocket) => this.runtime.ws.attachSocket(ws),
      detachSocket: (ws: WebSocket) => this.runtime.ws.detachSocket(ws),
      snapshot: () => this.runtime.ws.snapshot(),
      handleMessage: (ws: WebSocket, message: ClientMessage) =>
        this.runtime.ws.handleMessage(ws, message),
    };
  }
}
