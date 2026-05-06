export type RuntimeProcessMemorySnapshot = {
  arrayBuffers: number;
  external: number;
  heapTotal: number;
  heapUsed: number;
  rss: number;
};

export type RuntimeDebugMemorySnapshot = {
  capturedAt: string;
  process: RuntimeProcessMemorySnapshot;
  runtime: {
    activeConnections: number;
    buffers: number;
    channelUsers: number;
    channels: number;
    friends: number;
    mutedNicks: number;
    networks: number;
    nickEmojis: number;
    queryBuffers: number;
    websocketClients: number;
  };
};
