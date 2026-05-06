import type { RuntimeDebugMemorySnapshot } from '../shared/protocol-debug.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeSocketHub } from './runtime-socket-hub.js';
import type { RuntimeStore } from './runtime-store-ports.js';

export const createRuntimeDebugMemorySnapshot = (
  store: RuntimeStore,
  connections: Pick<RuntimeConnectionManager, 'connections'>,
  sockets: Pick<RuntimeSocketHub, 'size'>,
  now = new Date(),
): RuntimeDebugMemorySnapshot => {
  const buffers = store.conversations.listBuffers();
  const channels = store.conversations.listChannels();
  const processMemory = process.memoryUsage();

  return {
    capturedAt: now.toISOString(),
    process: {
      arrayBuffers: processMemory.arrayBuffers,
      external: processMemory.external,
      heapTotal: processMemory.heapTotal,
      heapUsed: processMemory.heapUsed,
      rss: processMemory.rss,
    },
    runtime: {
      activeConnections: connections.connections.size,
      buffers: buffers.length,
      channelUsers: channels.reduce((total, channel) => total + channel.users.length, 0),
      channels: channels.length,
      friends: store.friends.list().length,
      mutedNicks: store.mutedNicks.list().length,
      networks: store.networks.list().length,
      nickEmojis: store.nickEmojis.list().length,
      queryBuffers: buffers.filter((buffer) => buffer.kind === 'query').length,
      websocketClients: sockets.size,
    },
  };
};
