import WebSocket from 'ws';
import { encode, type ServerMessage } from '../shared/protocol.js';

export class RuntimeSocketHub {
  private readonly sockets = new Set<WebSocket>();

  constructor(private readonly onDrop: (ws: WebSocket) => void) {}

  attach(ws: WebSocket) {
    this.sockets.add(ws);
    ws.on('close', () => this.drop(ws));
  }

  detach(ws: WebSocket) {
    this.drop(ws);
  }

  broadcast(message: ServerMessage) {
    const payload = encode(message);
    for (const ws of Array.from(this.sockets)) {
      this.sendPayload(ws, payload);
    }
  }

  sendSocket(ws: WebSocket, message: ServerMessage) {
    return this.sendPayload(ws, encode(message));
  }

  closeAll() {
    for (const ws of Array.from(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.sockets.clear();
  }

  private sendPayload(ws: WebSocket, payload: string) {
    if (ws.readyState !== WebSocket.OPEN) {
      this.drop(ws);
      return false;
    }
    try {
      ws.send(payload);
      return true;
    } catch {
      this.drop(ws);
      try {
        ws.close();
      } catch {
        // Ignore close failures while cleaning up a broken socket.
      }
      return false;
    }
  }

  private drop(ws: WebSocket) {
    this.sockets.delete(ws);
    this.onDrop(ws);
  }
}
