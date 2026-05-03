import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { snapshotIrcCapabilities } from '../server/irc-capabilities.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { initialState, reducer } from '../web/src/app-state.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';

test('IRC capability snapshots expose sorted offered negotiated and pending names', () => {
  assert.deepEqual(
    snapshotIrcCapabilities({
      offered: new Set(['userhost-in-names', 'account-tag', 'echo-message']),
      negotiated: new Set(['echo-message']),
      pendingRequest: new Set(['userhost-in-names']),
    }),
    {
      offered: ['account-tag', 'echo-message', 'userhost-in-names'],
      negotiated: ['echo-message'],
      pending: ['userhost-in-names'],
    },
  );
});

test('runtime snapshots include negotiated IRC capabilities', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-capabilities-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createCapabilityServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    realName: 'Tester Example',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    assert.deepEqual(runtime.gateway.snapshot().networkStates[network.id]?.capabilities, {
      offered: ['account-tag', 'echo-message', 'multi-prefix', 'userhost-in-names'],
      negotiated: ['account-tag', 'echo-message', 'multi-prefix', 'userhost-in-names'],
      pending: [],
    });
    assert.equal(received.some((line) => line.startsWith('CAP REQ :')), true);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) =>
      server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network state reducer stores runtime capabilities', () => {
  const nextState = reducer(initialState, {
    type: 'network-state',
    networkId: 'network-1',
    phase: 'connecting',
    serverName: null,
    nick: 'tester',
    capabilities: {
      offered: ['account-tag', 'echo-message'],
      negotiated: ['echo-message'],
      pending: ['userhost-in-names'],
    },
  });

  assert.deepEqual(nextState.domain.networkStates['network-1'], {
    phase: 'connecting',
    serverName: null,
    nick: 'tester',
    capabilities: {
      offered: ['account-tag', 'echo-message'],
      negotiated: ['echo-message'],
      pending: ['userhost-in-names'],
    },
  });
});

const createCapabilityServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    let capEnded = false;
    let welcomed = false;
    const maybeWelcome = () => {
      if (nick && sawUser && capEnded && !welcomed) {
        welcomed = true;
        socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
      }
    };
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line === 'CAP LS 302') {
          socket.write(
            ':irc.example CAP * LS :multi-prefix echo-message userhost-in-names account-tag\r\n',
          );
        } else if (line.startsWith('CAP REQ :')) {
          socket.write(`:irc.example CAP * ACK :${line.slice('CAP REQ :'.length)}\r\n`);
        } else if (line === 'CAP END') {
          capEnded = true;
          maybeWelcome();
        } else if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
          maybeWelcome();
        } else if (line.startsWith('USER ')) {
          sawUser = true;
          maybeWelcome();
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};
