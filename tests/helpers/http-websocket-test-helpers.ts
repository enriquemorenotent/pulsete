import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export const connectWebSocket = (port: number) =>
  new Promise<{ socket: WebSocket; ready: Record<string, unknown> }>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const cleanup = () => {
      socket.off('message', handleMessage);
      socket.off('error', handleError);
      socket.off('close', handleClose);
    };
    const handleMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (message.type === 'state.ready') {
        cleanup();
        resolve({ socket, ready: message });
      }
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before the initial state was received'));
    };
    socket.on('message', handleMessage);
    socket.on('error', handleError);
    socket.on('close', handleClose);
  });

export const closeWebSocket = async (socket: WebSocket) => {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
};

const waitForMessageWithCleanup = (
  socket: WebSocket,
  label: string,
  predicate: (message: Record<string, unknown>) => boolean
) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for websocket message: ${label}`));
    }, 3000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', handleMessage);
      socket.off('error', handleError);
      socket.off('close', handleClose);
    };
    const handleMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(new Error(`WebSocket closed before the expected message was received: ${label}`));
    };
    socket.on('message', handleMessage);
    socket.on('error', handleError);
    socket.on('close', handleClose);
  });

export const waitForWebSocketMessageType = (socket: WebSocket, type: string) =>
  waitForMessageWithCleanup(socket, type, (message) => message.type === type);

export const waitForWebSocketMessage = (
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  label: string
) => waitForMessageWithCleanup(socket, label, predicate);

export const waitForWebSocketMessages = (socket: WebSocket, type: string, count: number) =>
  new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${count} websocket messages: ${type}`));
    }, 3000);
    const messages: Record<string, unknown>[] = [];
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', handleMessage);
      socket.off('error', handleError);
      socket.off('close', handleClose);
    };
    const handleMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (message.type !== type) {
        return;
      }
      messages.push(message);
      if (messages.length === count) {
        cleanup();
        resolve(messages);
      }
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before the expected messages were received'));
    };
    socket.on('message', handleMessage);
    socket.on('error', handleError);
    socket.on('close', handleClose);
  });

export const waitForWebSocketCloseDetails = (socket: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for websocket close'));
    }, 3000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('close', handleClose);
      socket.off('error', handleError);
    };
    const handleClose = (code: number, reason: Buffer) => {
      cleanup();
      resolve({ code, reason: reason.toString('utf8') });
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.on('close', handleClose);
    socket.on('error', handleError);
  });

export const createThrowingWebSocket = () => {
  let errorListenersAtSend = 0;
  const socket = new EventEmitter() as EventEmitter & { readyState: number; send(payload: string): boolean; close(): void };
  socket.readyState = WebSocket.OPEN;
  socket.send = () => {
    errorListenersAtSend = socket.listenerCount('error');
    socket.emit('error', new Error('boom'));
    return true;
  };
  socket.close = () => {};
  return { socket: socket as unknown as WebSocket, getErrorListenersAtSend: () => errorListenersAtSend };
};

export const createFailingWebSocket = () => {
  let closeCalls = 0;
  const socket = new EventEmitter() as EventEmitter & { readyState: number; send(payload: string): boolean; close(): void };
  socket.readyState = WebSocket.OPEN;
  socket.send = () => {
    throw new Error('boom');
  };
  socket.close = () => {
    closeCalls += 1;
  };
  return { socket: socket as unknown as WebSocket, getCloseCalls: () => closeCalls };
};

export const createBootstrapThenFailingWebSocket = () => {
  let closeCalls = 0;
  let sends = 0;
  const socket = new EventEmitter() as EventEmitter & { readyState: number; send(payload: string): boolean; close(): void };
  socket.readyState = WebSocket.OPEN;
  socket.send = () => {
    sends += 1;
    if (sends > 1) {
      throw new Error('boom');
    }
    return true;
  };
  socket.close = () => {
    closeCalls += 1;
  };
  return { socket: socket as unknown as WebSocket & EventEmitter, getCloseCalls: () => closeCalls };
};
