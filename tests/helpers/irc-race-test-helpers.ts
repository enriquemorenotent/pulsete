import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { IrcConnection } from '../../server/irc.js';
import type { ChannelUserState } from '../../shared/protocol.js';
import { waitFor } from './async-test-helpers.js';

export { waitFor };

export const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

export const createMockSocket = (writes: string[]) => {
  class MockSocket extends EventEmitter {
    destroyed = false;

    write(line: string) {
      writes.push(line);
      return true;
    }

    end() {}
    setEncoding() {}
    destroy() {
      this.destroyed = true;
      this.emit('close');
      return this;
    }
  }

  return new MockSocket();
};

export const createWelcomeServer = async (closeDelayMs = 0) => {
  let activeSocket: net.Socket | null = null;
  let closeRequested = false;
  let resolveCloseFinished!: () => void;
  const closeFinished = new Promise<void>((resolve) => {
    resolveCloseFinished = resolve;
  });
  const server = net.createServer((socket) => {
    activeSocket = socket;
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (line.startsWith('NICK ')) {
          sawNick = true;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (line.startsWith('QUIT ')) {
          closeRequested = true;
        }
        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }
        index = buffer.indexOf('\n');
      }
    });
    socket.on('end', () => {
      setTimeout(() => {
        socket.end();
        resolveCloseFinished();
      }, closeDelayMs);
    });
    socket.on('close', () => {
      if (!closeRequested) {
        resolveCloseFinished();
      }
      activeSocket = null;
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    closeFinished,
    destroySocket() {
      activeSocket?.destroy();
    },
  };
};

export const createConnection = (onEvent: (event: Record<string, unknown>) => void = () => {}) => new IrcConnection(
  {
    id: randomUUID(),
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: '127.0.0.1',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Test User',
    hasPassword: false,
    favorite: false,
    autoJoin: [],
  },
  { onEvent }
);
