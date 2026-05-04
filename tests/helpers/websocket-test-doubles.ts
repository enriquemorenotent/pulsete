import WebSocket from 'ws';

export const createWebSocketTestDouble = <Source extends object>(source: Source): WebSocket & Source => {
  const value: unknown = source;
  return value as WebSocket & Source;
};
