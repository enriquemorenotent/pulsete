import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { historyWindowLimit, type NetworkProfile } from '../shared/protocol.js';
import { createHttpHandler } from '../server/http-router.js';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { serveStatic } from '../server/static-handler.js';
import { Storage, type NetworkInput } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(address.port);
    });
  });

const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
};

const requestJson = async (
  port: number,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json() as Record<string, unknown>,
  };
};

const sendRawRequest = (port: number, rawRequest: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(rawRequest));
    let data = '';
    let settled = false;
    const resolveOnce = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(data);
    };
    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', resolveOnce);
    socket.on('close', resolveOnce);
    socket.on('error', rejectOnce);
    socket.setTimeout(500, () => socket.destroy(new Error('Timed out waiting for response')));
  });

const connectWebSocket = (port: number) =>
  new Promise<{ socket: WebSocket; ready: Record<string, unknown> }>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const cleanup = () => {
      socket.off('message', handleMessage);
      socket.off('error', handleError);
      socket.off('close', handleClose);
    };
    const handleMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (message.type !== 'state.ready') {
        return;
      }
      cleanup();
      resolve({ socket, ready: message });
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

const closeWebSocket = async (socket: WebSocket) => {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
};

const waitForWebSocketMessageType = (socket: WebSocket, type: string) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for websocket message: ${type}`));
    }, 3000);
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
      cleanup();
      resolve(message);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before the expected message was received'));
    };
    socket.on('message', handleMessage);
    socket.on('error', handleError);
    socket.on('close', handleClose);
  });

const waitForWebSocketMessage = (
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  label: string
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
      if (!predicate(message)) {
        return;
      }
      cleanup();
      resolve(message);
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

const waitForWebSocketMessages = (socket: WebSocket, type: string, count: number) =>
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
      if (messages.length < count) {
        return;
      }
      cleanup();
      resolve(messages);
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

const waitForWebSocketCloseDetails = (socket: WebSocket) =>
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

const createRegisteredServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (nick && sawUser) {
          socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
          sawUser = false;
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

const createNetworkInput = (overrides: Partial<NetworkInput> = {}): NetworkInput => ({
  templateId: null,
  managerHidden: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

test('snapshot returns the local workspace without auth state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', '/api/snapshot');
    const snapshot = response.json as {
      networks: Array<{ nick: string; username: string; realName: string }>;
      friends: unknown[];
      friendPresence: Record<string, boolean>;
      user?: unknown;
      bootstrapped?: unknown;
    };
    assert.equal(response.status, 200);
    assert.equal(snapshot.networks[0]?.nick, 'pulsete');
    assert.equal(snapshot.networks[0]?.username, 'pulsete');
    assert.equal(snapshot.networks[0]?.realName, 'Pulsete');
    assert.deepEqual(snapshot.friends, []);
    assert.deepEqual(snapshot.friendPresence, {});
    assert.equal('user' in snapshot, false);
    assert.equal('bootstrapped' in snapshot, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network routes are available without cookies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    await requestJson(port, 'GET', '/api/snapshot');
    const response = await requestJson(port, 'GET', '/api/networks');
    assert.equal(response.status, 200);
    assert.equal((response.json.networks as unknown[]).length, 4);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connect and disconnect return not found for missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const connectResponse = await requestJson(port, 'POST', '/api/networks/missing/connect', {});
    assert.equal(connectResponse.status, 404);
    assert.equal(connectResponse.json.message, 'Network not found');

    const disconnectResponse = await requestJson(port, 'POST', '/api/networks/missing/disconnect', {});
    assert.equal(disconnectResponse.status, 404);
    assert.equal(disconnectResponse.json.message, 'Network not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects invalid payloads and IRC-unsafe fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const invalidResponse = await requestJson(port, 'POST', '/api/networks', {
      name: '',
      host: '',
      port: 0,
      tls: 'yes',
      nick: '',
      username: '',
      autoJoin: ['#test'],
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidResponse.json.message, 'Network name is required');

    const unsafeResponse = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      realName: 'Tester\r\nOPER root',
    });
    assert.equal(unsafeResponse.status, 400);
    assert.equal(unsafeResponse.json.message, 'Real name cannot contain carriage returns or line feeds');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects invalid and immutable template relationships', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
  }));
  const otherTemplate = storage.upsertNetwork(createNetworkInput({
    name: 'OtherTemplateNet',
    host: 'irc2.example.test',
    port: 6697,
    tls: true,
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  const port = await listen(server);

  try {
    const visibleClone = await requestJson(port, 'POST', '/api/networks', {
      ...template,
      templateId: template.id,
      managerHidden: false,
      name: 'Visible clone',
    });
    assert.equal(visibleClone.status, 400);
    assert.equal(visibleClone.json.message, 'Saved networks cannot reference a template');

    const orphanInstance = await requestJson(port, 'POST', '/api/networks', {
      ...template,
      templateId: null,
      managerHidden: true,
      name: 'Orphan instance',
    });
    assert.equal(orphanInstance.status, 400);
    assert.equal(orphanInstance.json.message, 'Connection instances must reference an existing saved network');

    const reparentClone = await requestJson(port, 'PUT', `/api/networks/${clone.id}`, {
      ...clone,
      templateId: otherTemplate.id,
    });
    assert.equal(reparentClone.status, 400);
    assert.equal(reparentClone.json.message, 'Network template relationship cannot be changed after creation');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects conflicting and empty password updates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const conflict = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      password: 'secret',
      clearPassword: true,
    });
    assert.equal(conflict.status, 400);
    assert.equal(conflict.json.message, 'Password cannot be updated and cleared in the same request');

    const empty = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      password: '',
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.json.message, 'Password cannot be empty');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save broadcasts template and instance updates over websocket', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
    nick: 'oldnick',
    altNicks: ['oldnick_'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
    nick: 'oldnick',
    altNicks: ['oldnick_'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const updatesPromise = waitForWebSocketMessages(socket, 'network.upsert', 2);
    const response = await requestJson(port, 'PUT', `/api/networks/${template.id}`, {
      ...template,
      nick: 'newnick',
      altNicks: ['newnick_'],
      username: 'newuser',
      realName: 'New User',
    });
    assert.equal(response.status, 200);

    const updates = await updatesPromise;
    assert.deepEqual(
      updates.map((message) => (message.network as { id: string }).id).sort(),
      [clone.id, template.id].sort()
    );
    assert.equal(storage.getNetwork(clone.id)?.nick, 'newnick');
    assert.equal(storage.getNetwork(clone.id)?.username, 'newuser');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete returns all deleted network ids when removing a template', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
  }));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${template.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [...(response.json.deletedNetworkIds as string[])].sort(),
      [clone.id, template.id].sort()
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('duplicate creates a new saved network and preserves encrypted passwords', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput({
    name: 'PrimaryNet',
    host: 'irc.primary.test',
    port: 6697,
    tls: true,
    nick: 'sofia',
    altNicks: ['sofia_', 'sofia__'],
    username: 'sofia',
    realName: 'Sofia',
    password: 'hunter2',
    favorite: true,
    autoJoin: ['#help'],
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const updatePromise = waitForWebSocketMessageType(socket, 'network.upsert');
    const response = await requestJson(port, 'POST', `/api/networks/${network.id}/duplicate`, {});
    assert.equal(response.status, 200);

    const duplicate = response.json.network as NetworkProfile;
    assert.notEqual(duplicate.id, network.id);
    assert.equal(duplicate.name, 'PrimaryNet copy');
    assert.equal(duplicate.host, network.host);
    assert.equal(duplicate.port, network.port);
    assert.equal(duplicate.tls, network.tls);
    assert.equal(duplicate.nick, network.nick);
    assert.deepEqual(duplicate.altNicks, network.altNicks);
    assert.equal(duplicate.username, network.username);
    assert.equal(duplicate.realName, network.realName);
    assert.equal(duplicate.favorite, true);
    assert.deepEqual(duplicate.autoJoin, ['#help']);
    assert.equal(duplicate.managerHidden, false);
    assert.equal(duplicate.templateId, null);
    assert.equal(duplicate.hasPassword, true);
    assert.equal(storage.getRuntimeNetwork(duplicate.id)?.password, 'hunter2');

    const update = await updatePromise as { network: NetworkProfile };
    assert.equal(update.network.id, duplicate.id);

    const secondResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/duplicate`, {});
    assert.equal(secondResponse.status, 200);
    assert.equal((secondResponse.json.network as NetworkProfile).name, 'PrimaryNet copy 2');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('query routes validate missing networks and invalid targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
  });
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const missing = await requestJson(port, 'POST', '/api/networks/missing/queries', { target: 'helper' });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.message, 'Network not found');

    const invalidTarget = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: '#help' });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'Server' });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'alice,bob' });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const invalidPayload = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid query payload');

    const invalidClose = await requestJson(port, 'DELETE', `/api/buffers/${channel.id}`);
    assert.equal(invalidClose.status, 400);
    assert.equal(invalidClose.json.message, 'Only private message buffers can be closed');
    assert.equal(storage.getBuffer(query.id)?.target, 'helper');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('friend routes persist entries and broadcast updates without auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const addMessagePromise = waitForWebSocketMessageType(socket, 'friend.upsert');
    const presenceMessagePromise = waitForWebSocketMessageType(socket, 'friend.presence');
    const createResponse = await requestJson(port, 'POST', '/api/friends', { nick: 'Alice' });
    assert.equal(createResponse.status, 200);
    assert.equal((createResponse.json.friend as { nick: string }).nick, 'Alice');

    const addMessage = await addMessagePromise as {
      friend: { id: string; nick: string };
    };
    assert.equal(addMessage.friend.nick, 'Alice');
    const presenceMessage = await presenceMessagePromise as { friendId: string; online: boolean };
    assert.equal(presenceMessage.friendId, addMessage.friend.id);
    assert.equal(presenceMessage.online, false);

    const duplicateResponse = await requestJson(port, 'POST', '/api/friends', { nick: 'alice' });
    assert.equal(duplicateResponse.status, 200);
    assert.equal((duplicateResponse.json.friend as { id: string }).id, addMessage.friend.id);

    const existingQuery = storage.upsertQuery(network.id, 'Alice');
    assert.equal(existingQuery.target, 'Alice');

    const removeMessagePromise = waitForWebSocketMessageType(socket, 'friend.remove');
    const deleteResponse = await requestJson(port, 'DELETE', `/api/friends/${addMessage.friend.id}`);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.json.ok, true);

    const removeMessage = await removeMessagePromise as { friendId: string };
    assert.equal(removeMessage.friendId, addMessage.friend.id);
    assert.equal(storage.listFriends().length, 0);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('friend routes validate payloads and targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  const port = await listen(server);

  try {
    const invalidPayload = await requestJson(port, 'POST', '/api/friends', { nick: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid friend payload');

    const invalidTarget = await requestJson(port, 'POST', '/api/friends', { nick: '#help' });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(port, 'POST', '/api/friends', { nick: 'Server' });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(port, 'POST', '/api/friends', { nick: 'alice,bob' });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const tooLongNick = await requestJson(port, 'POST', '/api/friends', { nick: 'x'.repeat(600) });
    assert.equal(tooLongNick.status, 400);
    assert.equal(tooLongNick.json.message, 'Friend nick is too long');

    const missingDelete = await requestJson(port, 'DELETE', '/api/friends/missing-friend');
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.json.message, 'Friend not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('buffer read emits updates and clears unread counts without auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    unread: 0,
  });
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const unreadBufferPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    handleRuntimeEvent(runtime, {
      type: 'message',
      message: {
        id: 'msg-1',
        networkId: network.id,
        target: '#help',
        nick: 'bob',
        body: 'hello',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    });

    const unreadBuffer = await unreadBufferPromise as {
      buffer: { id: string; unread: number };
    };
    assert.equal(unreadBuffer.buffer.id, channel.id);
    assert.equal(unreadBuffer.buffer.unread, 1);

    const clearedBufferPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    const response = await requestJson(port, 'POST', `/api/buffers/${channel.id}/read`, {});
    assert.equal(response.status, 200);

    const clearedBuffer = await clearedBufferPromise as {
      buffer: { id: string; unread: number };
    };
    assert.equal(clearedBuffer.buffer.id, channel.id);
    assert.equal(clearedBuffer.buffer.unread, 0);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('history clamps invalid and oversized limits to the default window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const buffer = storage.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help' });
  for (let index = 0; index < 250; index += 1) {
    storage.appendMessage({
      id: `m${index}`,
      networkId: network.id,
      target: '#help',
      nick: 'alice',
      body: `message ${index}`,
      kind: 'line',
      self: true,
      ts: Date.now() + index,
    });
  }
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const invalidLimit = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=-1`);
    const invalidBody = await invalidLimit.json() as { messages: Array<{ body: string }> };
    assert.equal(invalidLimit.status, 200);
    assert.equal(invalidBody.messages.length, historyWindowLimit);
    assert.equal(invalidBody.messages[0]?.body, 'message 0');
    assert.equal(invalidBody.messages.at(-1)?.body, 'message 249');

    const oversizedLimit = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=1000000`);
    const oversizedBody = await oversizedLimit.json() as { messages: Array<{ body: string }> };
    assert.equal(oversizedLimit.status, 200);
    assert.equal(oversizedBody.messages.length, historyWindowLimit);
    assert.equal(oversizedBody.messages[0]?.body, 'message 0');
    assert.equal(oversizedBody.messages.at(-1)?.body, 'message 249');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('http buffer mutation routes succeed and broadcast buffer changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const queryMessagePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'buffer.upsert helper'
    );
    const queryResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'helper' });
    assert.equal(queryResponse.status, 200);
    const queryBuffer = queryResponse.json.buffer as { id: string; kind: string; target: string };
    assert.equal(queryBuffer.kind, 'query');
    assert.equal(queryBuffer.target, 'helper');
    assert.equal(((await queryMessagePromise) as { buffer: { target: string } }).buffer.target, 'helper');

    runtime.connect(network.id);
    await waitFor(() => ircReceived.includes('NICK tester'));

    const channelMessagePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === '#help',
      'buffer.upsert #help'
    );
    const channelResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/channels`, { channel: '#help' });
    assert.equal(channelResponse.status, 200);
    const channelBuffer = channelResponse.json.buffer as { id: string; kind: string; target: string };
    assert.equal(channelBuffer.kind, 'channel');
    assert.equal(channelBuffer.target, '#help');
    assert.equal(((await channelMessagePromise) as { buffer: { target: string } }).buffer.target, '#help');

    const removeMessagePromise = waitForWebSocketMessageType(socket, 'buffer.remove');
    const deleteResponse = await requestJson(port, 'DELETE', `/api/buffers/${queryBuffer.id}`, {});
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await removeMessagePromise, {
      type: 'buffer.remove',
      networkId: network.id,
      bufferId: queryBuffer.id,
    });
  } finally {
    runtime.disconnect(network.id);
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('http connect and disconnect routes drive the IRC connection lifecycle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const connectedStatePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'network.state' && message.networkId === network.id && message.connected === true,
      'connected network.state'
    );
    const connectResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/connect`, {});
    assert.equal(connectResponse.status, 200);
    assert.equal(connectResponse.json.ok, true);
    await waitFor(() => ircReceived.includes('NICK tester'));
    await connectedStatePromise;

    const disconnectedStatePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'network.state' && message.networkId === network.id && message.connected === false,
      'disconnected network.state'
    );
    const disconnectResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/disconnect`, {});
    assert.equal(disconnectResponse.status, 200);
    assert.equal(disconnectResponse.json.ok, true);
    await waitFor(() => ircReceived.some((line) => line.startsWith('QUIT :Client disconnecting')));
    await disconnectedStatePromise;
  } finally {
    runtime.disconnect(network.id);
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler returns a clear error when built assets are missing', async () => {
  const assetRoot = join(mkdtempSync(join(tmpdir(), 'pulsete-assets-')), 'missing-dist');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void serveStatic(pathname, res, { assetRoot });
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'Built assets not found. Run `npm run build` before starting the server.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler serves built assets and spa fallback from the asset root', async () => {
  const assetRoot = join(mkdtempSync(join(tmpdir(), 'pulsete-assets-')), 'dist');
  mkdirSync(join(assetRoot, 'assets'), { recursive: true });
  writeFileSync(join(assetRoot, 'index.html'), '<!doctype html><html><body>pulsete</body></html>');
  writeFileSync(join(assetRoot, 'assets', 'app.js'), 'console.log("pulsete");');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void serveStatic(pathname, res, { assetRoot });
  });
  const port = await listen(server);

  try {
    const indexResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /pulsete/);

    const assetResponse = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.match(await assetResponse.text(), /console\.log/);

    const fallbackResponse = await fetch(`http://127.0.0.1:${port}/workspace`);
    assert.equal(fallbackResponse.status, 200);
    assert.match(await fallbackResponse.text(), /pulsete/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler does not expose repository files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/package.json`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connect route does not allow GET side effects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', `/api/networks/${network.id}/connect`);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed request targets and route params return handled bad requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    const invalidTargetResponse = await sendRawRequest(
      port,
      'GET http://% HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
    );
    assert.match(invalidTargetResponse, /^HTTP\/1\.1 400 Bad Request/m);
    assert.match(invalidTargetResponse, /Invalid request target/);

    const invalidParamResponse = await requestJson(port, 'POST', '/api/networks/%E0%A4%A/connect', {});
    assert.equal(invalidParamResponse.status, 400);
    assert.equal(invalidParamResponse.json.message, 'Invalid request parameter');

    const invalidQueryTarget = await requestJson(port, 'DELETE', '/api/buffers/%E0%A4%A');
    assert.equal(invalidQueryTarget.status, 400);
    assert.equal(invalidQueryTarget.json.message, 'Invalid request parameter');
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed websocket upgrade targets are destroyed without uncaught exceptions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    await sendRawRequest(
      port,
      [
        'GET http://% HTTP/1.1',
        'Host: 127.0.0.1',
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n')
    );
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized json bodies are rejected before parsing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      realName: 'x'.repeat(70_000),
    });
    assert.equal(response.status, 413);
    assert.equal(response.json.message, 'Request body too large');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket upgrade succeeds without cookies and emits state.ready', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);

  try {
    const { socket, ready } = await connectWebSocket(port);
    assert.equal(ready.type, 'state.ready');
    assert.ok(Array.isArray(ready.snapshot ? (ready.snapshot as { networks: unknown[] }).networks : []));
    await closeWebSocket(socket);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket state requests use the live local state and forward commands to runtime methods', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');
  const runtime = new Runtime(storage);
  const calls: string[] = [];
  runtime.connect = ((networkId: string) => {
    calls.push(`connect:${networkId}`);
  }) as Runtime['connect'];
  runtime.disconnect = ((networkId: string) => {
    calls.push(`disconnect:${networkId}`);
  }) as Runtime['disconnect'];
  runtime.openQuery = ((networkId: string, target: string) => {
    calls.push(`query.open:${networkId}:${target}`);
    return query;
  }) as Runtime['openQuery'];
  runtime.requestChannelList = ((networkId: string) => {
    calls.push(`channel.list.request:${networkId}`);
    runtime.send({ type: 'channel.list.started', networkId, requestId: 'request-1' });
    return 'request-1';
  }) as Runtime['requestChannelList'];
  runtime.cancelChannelList = ((networkId: string) => {
    calls.push(`channel.list.cancel:${networkId}`);
  }) as Runtime['cancelChannelList'];
  runtime.sendRaw = ((networkId: string, raw: string, sourceBufferId?: string) => {
    calls.push(`raw.send:${networkId}:${raw}:${sourceBufferId ?? ''}`);
  }) as Runtime['sendRaw'];

  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket, ready } = await connectWebSocket(port);

  try {
    assert.equal((ready.snapshot as { networks: Array<{ id: string }> }).networks.some((entry) => entry.id === network.id), true);

    const stateReadyPromise = waitForWebSocketMessageType(socket, 'state.ready');
    socket.send(JSON.stringify({ type: 'state.request' }));
    const stateReady = await stateReadyPromise;
    assert.equal((stateReady.snapshot as { networks: Array<{ id: string }> }).networks.some((entry) => entry.id === network.id), true);

    const queryOpenPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    const channelListPromise = waitForWebSocketMessageType(socket, 'channel.list.started');
    socket.send(JSON.stringify({ type: 'network.connect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'network.disconnect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'helper' }));
    socket.send(JSON.stringify({ type: 'channel.list.request', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'channel.list.cancel', networkId: network.id }));
    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: '/quote WHOIS alice',
      sourceBufferId: query.id,
    }));

    assert.deepEqual(await queryOpenPromise, {
      type: 'buffer.upsert',
      buffer: query,
    });
    assert.deepEqual(await channelListPromise, {
      type: 'channel.list.started',
      networkId: network.id,
      requestId: 'request-1',
    });
    assert.deepEqual(calls, [
      `connect:${network.id}`,
      `disconnect:${network.id}`,
      `query.open:${network.id}:helper`,
      `channel.list.request:${network.id}`,
      `channel.list.cancel:${network.id}`,
      `raw.send:${network.id}:/quote WHOIS alice:${query.id}`,
    ]);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket query.open uses the live runtime path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const queryOpenPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'live query.open buffer'
    );
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'helper' }));
    const opened = await queryOpenPromise as { buffer: { id: string; target: string; kind: string } };
    assert.equal(opened.buffer.target, 'helper');
    assert.equal(opened.buffer.kind, 'query');
    assert.equal(storage.getBuffer(opened.buffer.id)?.target, 'helper');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket channel.list.cancel ignores missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);
  const messages: Array<Record<string, unknown>> = [];
  const handleMessage = (payload: WebSocket.RawData) => {
    messages.push(JSON.parse(payload.toString()) as Record<string, unknown>);
  };

  socket.on('message', handleMessage);

  try {
    socket.send(JSON.stringify({ type: 'channel.list.cancel', networkId: 'missing-network' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.deepEqual(messages.filter((message) => message.type === 'error'), []);
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.off('message', handleMessage);
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket join, message, and part commands reach the live IRC connection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    socket.send(JSON.stringify({ type: 'network.connect', networkId: network.id }));
    await waitFor(() => ircReceived.includes('NICK tester'));

    const joinPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === '#help',
      'websocket join buffer'
    );
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: '#help' }));
    assert.equal(((await joinPromise) as { buffer: { target: string } }).buffer.target, '#help');
    await waitFor(() => ircReceived.includes('JOIN #help'));

    const queryOpenPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'self query buffer'
    );
    const appendPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'message.append' && (message.message as { body?: string } | undefined)?.body === 'hello there',
      'self message.append'
    );
    socket.send(JSON.stringify({
      type: 'message.send',
      networkId: network.id,
      target: 'helper',
      body: 'hello there',
      kind: 'message',
    }));
    assert.equal(((await queryOpenPromise) as { buffer: { target: string; kind: string } }).buffer.kind, 'query');
    const appended = await appendPromise as { message: { target: string; body: string; self: boolean } };
    assert.equal(appended.message.target, 'helper');
    assert.equal(appended.message.body, 'hello there');
    assert.equal(appended.message.self, true);
    await waitFor(() => ircReceived.includes('PRIVMSG helper :hello there'));

    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: 'WHOIS alice',
    }));
    await waitFor(() => ircReceived.includes('WHOIS alice'));

    socket.send(JSON.stringify({ type: 'channel.part', networkId: network.id, channel: '#help' }));
    await waitFor(() => ircReceived.some((line) => line.startsWith('PART #help :Leaving')));
  } finally {
    runtime.disconnect(network.id);
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized websocket payloads are rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const closePromise = waitForWebSocketCloseDetails(socket);
    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: 'x'.repeat(70_000),
    }));
    const close = await closePromise;
    assert.equal(close.code, 1009);
  } finally {
    socket.terminate();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket validation returns errors for invalid channel, query, and message targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  storage.upsertQuery(network.id, 'helper');
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const joinErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: 'helper' }));
    assert.equal((await joinErrorPromise).message, 'Channel name must start with #, &, +, or !');

    const multiJoinErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: '#help,#ops' }));
    assert.equal((await multiJoinErrorPromise).message, 'Channel name must refer to a single channel');

    const queryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: '#help' }));
    assert.equal((await queryErrorPromise).message, 'Private-message target is required');

    const reservedQueryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'Server' }));
    assert.equal((await reservedQueryErrorPromise).message, 'Private-message target is required');

    const multiQueryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'alice,bob' }));
    assert.equal((await multiQueryErrorPromise).message, 'Private-message target must refer to a single nick');

    const messageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: '   ', body: 'hello', kind: 'message' }));
    assert.equal((await messageErrorPromise).message, 'Private-message target is required');

    const multiMessageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: 'alice,bob', body: 'hello', kind: 'message' }));
    assert.equal((await multiMessageErrorPromise).message, 'Private-message target must refer to a single nick');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
