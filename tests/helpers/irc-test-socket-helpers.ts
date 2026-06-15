import net from 'node:net';
import type { IrcConnectionState, IrcSocket } from '../../server/irc-types.js';

export type MockIrcSocket = net.Socket;

type MockSocketOptions = {
  emitCloseOnDestroy?: boolean;
  failWrite?: boolean;
};

export const createMockSocket = (writes: string[] = [], options: MockSocketOptions = {}): MockIrcSocket => {
  class MockSocket extends net.Socket {
    destroyed = false;

    write(chunk: unknown, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) {
      writes.push(typeof chunk === 'string' ? chunk : String(chunk));
      if (options.failWrite) {
        throw new Error('boom');
      }
      const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      done?.();
      return true;
    }

    end(..._args: unknown[]) {
      return this;
    }

    setEncoding(_encoding?: BufferEncoding) {
      return this;
    }

    setKeepAlive(_enable?: boolean, _initialDelay?: number) {
      return this;
    }

    destroy() {
      this.destroyed = true;
      if (options.emitCloseOnDestroy ?? true) {
        this.emit('close');
      }
      return this;
    }
  }

  return new MockSocket();
};

export const createThrowingMockSocket = (writes: string[] = []) =>
  createMockSocket(writes, { emitCloseOnDestroy: false, failWrite: true });

export const attachMockSocket = (
  connection: Pick<IrcConnectionState, 'lifecycle'>,
  socket: MockIrcSocket = createMockSocket(),
) => {
  connection.lifecycle.socket = socket;
  return socket;
};

export const mockNetConnect = (socketOrFactory: MockIrcSocket | (() => MockIrcSocket)) => {
  const originalConnect = net.connect;
  const getSocket = typeof socketOrFactory === 'function'
    ? socketOrFactory
    : () => socketOrFactory;
  net.connect = (() => getSocket()) as typeof net.connect;
  return () => {
    net.connect = originalConnect;
  };
};
