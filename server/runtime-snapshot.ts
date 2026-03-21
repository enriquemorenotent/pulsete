import { createStorageSnapshot } from './storage-snapshot.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { Storage } from './storage.js';

export const createRuntimeSnapshot = (store: Storage, connectionManager: RuntimeConnectionManager) => {
  const snapshot = createStorageSnapshot(store);
  return {
    ...snapshot,
    ...connectionManager.snapshot(snapshot.networks, snapshot.friends),
  };
};
