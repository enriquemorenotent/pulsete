import { createStorageSnapshot } from './storage-snapshot.js';
import type { AppSnapshot } from '../shared/protocol-app.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { StorageSnapshotSource } from './storage-types.js';

export const createRuntimeSnapshot = (
  store: StorageSnapshotSource,
  connectionManager: RuntimeConnectionManager,
): AppSnapshot => {
  const snapshot = createStorageSnapshot(store);
  return {
    ...snapshot,
    ...connectionManager.snapshot(snapshot.networks, snapshot.friends),
  };
};
