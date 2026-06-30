import { createRuntimeSnapshot } from './runtime-snapshot.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeGateway, RuntimeStore } from './runtime-service-types.js';
import type { RuntimePublisher } from './runtime-publisher.js';
import type { RuntimeSocketHub } from './runtime-socket-hub.js';

type RuntimeGatewayParams = {
  connectionManager: RuntimeConnectionManager;
  onClose: () => void;
  publisher: RuntimePublisher;
  socketHub: RuntimeSocketHub;
  store: RuntimeStore;
};

export const createRuntimeGateway = ({
  connectionManager,
  onClose,
  publisher,
  socketHub,
  store,
}: RuntimeGatewayParams): RuntimeGateway => ({
  attachSocket: (ws) => socketHub.attach(ws),
  detachSocket: (ws) => socketHub.detach(ws),
  publish: (message) => publisher.publish(message),
  snapshot: () => createRuntimeSnapshot(store.snapshotSource, connectionManager),
  close: onClose,
});
