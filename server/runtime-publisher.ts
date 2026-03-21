import type WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';

export class RuntimePublisher {
  constructor(private readonly socketHub: RuntimeSocketHub) {}

  publish(message: ServerMessage | readonly ServerMessage[]) {
    const messages = Array.isArray(message) ? message : [message];
    for (const entry of messages) {
      this.socketHub.broadcast(entry);
    }
  }

  sendSocket(ws: WebSocket, message: ServerMessage) {
    return this.socketHub.sendSocket(ws, message);
  }
}
