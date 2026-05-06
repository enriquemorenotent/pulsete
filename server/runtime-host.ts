import type WebSocket from 'ws';
import type { ClientMessage } from '../shared/protocol-messages.js';
import { createRuntime, type Runtime, type RuntimeHttpApi } from './runtime.js';
import { Storage } from './storage.js';
import { prepareStorageBackupRestore } from './storage-backup.js';
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

  private openRuntime() {
    const storage = new Storage(this.paths);
    return {
      runtime: createRuntime(storage.runtimeStore),
      storage,
    };
  }

  private restore(backupContent: Buffer) {
    const prepared = prepareStorageBackupRestore({ backupContent, paths: this.paths });
    this.close();
    prepared.apply();
    const current = this.openRuntime();
    this.storage = current.storage;
    this.runtime = current.runtime;
    return { browserPreferences: prepared.browserPreferences };
  }

  private createHttpApi(): RuntimeHost['http'] {
    return {
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
      },
      logs: {
        search: (query, limit, filters) => this.runtime.http.logs.search(query, limit, filters),
      },
      debug: {
        memory: () => this.runtime.http.debug.memory(),
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
