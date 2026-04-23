import { createStorageSnapshot } from './storage-snapshot.js';
import type { AppSnapshot } from '../shared/protocol.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeSnapshotSource } from './runtime-store-ports.js';

export const createRuntimeSnapshot = (
  store: RuntimeSnapshotSource,
  connectionManager: RuntimeConnectionManager,
): AppSnapshot => {
  const snapshot = createStorageSnapshot(store);
  return {
    ...snapshot,
    ...connectionManager.snapshot(snapshot.networks, snapshot.friends),
  };
};
