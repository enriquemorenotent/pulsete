import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ServerMessage } from '../../shared/protocol.js';

export const createSocketRecorder = () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    sent: ServerMessage[];
    send(payload: string): void;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.sent = [];
  socket.send = (payload: string) => {
    socket.sent.push(JSON.parse(payload) as ServerMessage);
  };
  socket.close = () => {
    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
  };
  return socket as unknown as WebSocket & { sent: ServerMessage[]; close(): void };
};

export const createThrowingSocket = () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    closed: boolean;
    send(payload: string): void;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.closed = false;
  socket.send = () => {
    throw new Error('boom');
  };
  socket.close = () => {
    socket.closed = true;
    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
  };
  return socket as unknown as WebSocket & { closed: boolean };
};
