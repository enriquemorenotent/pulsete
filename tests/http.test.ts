import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import WebSocket from 'ws';
import { historyWindowLimit } from '../shared/protocol.js';
import { createHttpHandler } from '../server/http-router.js';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { serveStatic } from '../server/static-handler.js';
import { Storage } from '../server/storage.js';
import { hashPassword } from '../server/storage-utils.js';
import { attachWebSocketServer } from '../server/ws-server.js';

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(address.port);
    });
  });

const requestJson = async (
  port: number,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  cookie?: string
) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    json: await response.json() as { message?: string },
  };
};

const request = (port: number, path: string, init?: RequestInit) =>
  fetch(`http://127.0.0.1:${port}${path}`, init);

const sessionCookieFrom = (response: Response) => {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected a session cookie');
  return setCookie.split(';', 1)[0];
};

const sendRawRequest = (port: number, request: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(request));
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

const connectWebSocket = (port: number, cookie: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: cookie } });
    const cleanup = () => {
      socket.off('open', handleOpen);
      socket.off('error', handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve(socket);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.on('open', handleOpen);
    socket.on('error', handleError);
  });

const waitForWebSocketClose = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for websocket close'));
    }, 3000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('close', handleClose);
      socket.off('error', handleError);
    };
    const handleClose = () => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.on('close', handleClose);
    socket.on('error', handleError);
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

test('register returns a conflict response for duplicate usernames', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.bootstrapUser('alice', 'secret');

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/register', { username: 'alice', password: 'secret2' });
    assert.equal(response.status, 409);
    assert.equal(response.json.message, 'Username already exists');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('login preserves raw usernames for legacy canonical collisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const db = new DatabaseSync(file);
  const seed = (id: string, username: string) => {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, hashPassword('pw', salt), salt, Date.now());
  };
  seed('u1', 'alice');
  seed('u2', ' alice ');
  db.close();

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/login', { username: ' alice ', password: 'pw' });
    assert.equal(response.status, 200);
    assert.equal((response.json as { user: { id: string; username: string } }).user.id, 'u2');
    assert.equal((response.json as { user: { id: string; username: string } }).user.username, ' alice ');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('auth lifecycle issues and clears real session cookies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const bootstrap = await request(port, '/api/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret' }),
    });
    assert.equal(bootstrap.status, 200);
    const bootstrapCookie = sessionCookieFrom(bootstrap);
    const bootstrapBody = await bootstrap.json() as { authenticated: boolean };
    assert.equal(bootstrapBody.authenticated, true);

    const bootstrapSession = await request(port, '/api/session', { headers: { Cookie: bootstrapCookie } });
    assert.equal(bootstrapSession.status, 200);
    assert.equal((await bootstrapSession.json() as { authenticated: boolean }).authenticated, true);

    const logout = await request(port, '/api/logout', {
      method: 'POST',
      headers: { Cookie: bootstrapCookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/);

    const afterLogout = await request(port, '/api/session', { headers: { Cookie: bootstrapCookie } });
    assert.equal(afterLogout.status, 200);
    assert.equal((await afterLogout.json() as { authenticated: boolean }).authenticated, false);

    const register = await request(port, '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'secret2' }),
    });
    assert.equal(register.status, 200);
    const registerCookie = sessionCookieFrom(register);
    assert.equal((await register.json() as { user: { username: string } }).user.username, 'bob');

    const login = await request(port, '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'secret2' }),
    });
    assert.equal(login.status, 200);
    const loginCookie = sessionCookieFrom(login);
    const loginBody = await login.json() as { authenticated: boolean; user: { username: string } };
    assert.equal(loginBody.authenticated, true);
    assert.equal(loginBody.user.username, 'bob');

    const loginSession = await request(port, '/api/session', { headers: { Cookie: loginCookie } });
    assert.equal(loginSession.status, 200);
    assert.equal((await loginSession.json() as { authenticated: boolean }).authenticated, true);

    const registerLogout = await request(port, '/api/logout', {
      method: 'POST',
      headers: { Cookie: registerCookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(registerLogout.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('unauthenticated api requests are rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.bootstrapUser('alice', 'secret');
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', '/api/networks');
    assert.equal(response.status, 401);
    assert.equal(response.json.message, 'Authentication required');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('unauthenticated websocket upgrades are refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.bootstrapUser('alice', 'secret');
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);

  try {
    const response = await sendRawRequest(
      port,
      [
        'GET /ws HTTP/1.1',
        'Host: 127.0.0.1',
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n')
    );
    assert.equal(response.includes('101 Switching Protocols'), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized json bodies are rejected before parsing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/bootstrap', {
      username: 'alice',
      password: 'x'.repeat(70_000),
    });
    assert.equal(response.status, 413);
    assert.equal(response.json.message, 'Request body too large');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connect returns not found for missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks/missing/connect', {}, cookie);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Network not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('disconnect returns not found for missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks/missing/disconnect', {}, cookie);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Network not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('bootstrap rejects blank credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/bootstrap', { username: '   ', password: '' });
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Username is required');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects invalid payloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks', {
      name: '',
      host: '',
      port: 0,
      tls: 'yes',
      nick: '',
      username: '',
      autoJoin: ['#test'],
    }, cookie);
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Network name is required');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects IRC-unsafe fields and auto-join targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const realNameResponse = await requestJson(port, 'POST', '/api/networks', {
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'alice',
      altNicks: ['alice_'],
      username: 'alice',
      realName: 'Alice\r\nOPER root',
      favorite: false,
      autoJoin: [],
    }, cookie);
    assert.equal(realNameResponse.status, 400);
    assert.equal(realNameResponse.json.message, 'Real name cannot contain carriage returns or line feeds');

    const autoJoinResponse = await requestJson(port, 'POST', '/api/networks', {
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'alice',
      altNicks: ['alice_'],
      username: 'alice',
      realName: 'Alice Example',
      favorite: false,
      autoJoin: ['#help there'],
    }, cookie);
    assert.equal(autoJoinResponse.status, 400);
    assert.equal(autoJoinResponse.json.message, 'Channel name must start with #, &, +, or !');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects conflicting password updates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks', {
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'alice',
      altNicks: ['alice_'],
      username: 'alice',
      realName: 'Alice Example',
      password: 'secret',
      clearPassword: true,
      autoJoin: [],
    }, cookie);
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Password cannot be updated and cleared in the same request');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects empty string passwords', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks', {
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'alice',
      altNicks: ['alice_'],
      username: 'alice',
      realName: 'Alice Example',
      password: '',
      autoJoin: [],
    }, cookie);
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Password cannot be empty');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network update cannot overwrite another user network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const bobSession = storage.createSession(bob.id);
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'alice.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(bobSession.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'PUT', `/api/networks/${network.id}`, {
      name: 'BobOverwrite',
      host: 'bob.example.test',
      port: 6697,
      tls: true,
      nick: 'bob',
      altNicks: ['bob_'],
      username: 'bob',
      realName: 'bob',
      favorite: true,
      autoJoin: ['#owned'],
    }, cookie);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Network not found');
    assert.equal(storage.getNetwork(bob.id, network.id), null);
    assert.equal(storage.getNetwork(alice.id, network.id)?.name, 'AliceNet');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete returns not found for missing or foreign networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const bobSession = storage.createSession(bob.id);
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'alice.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(bobSession.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const missingResponse = await requestJson(port, 'DELETE', '/api/networks/missing', undefined, cookie);
    assert.equal(missingResponse.status, 404);
    assert.equal(missingResponse.json.message, 'Network not found');

    const foreignResponse = await requestJson(port, 'DELETE', `/api/networks/${network.id}`, undefined, cookie);
    assert.equal(foreignResponse.status, 404);
    assert.equal(foreignResponse.json.message, 'Network not found');
    assert.equal(storage.getNetwork(alice.id, network.id)?.name, 'AliceNet');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete returns all deleted network ids when removing a template', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const template = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const clone = storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: template.id,
    managerHidden: true,
    name: `${template.name} clone`,
  });
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${template.id}`, undefined, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [...((response.json as { deletedNetworkIds: string[] }).deletedNetworkIds)].sort(),
      [clone.id, template.id].sort()
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('open query returns not found for missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks/missing/queries', { target: 'helper' }, cookie);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Network not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('open query rejects invalid private-message targets over http', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    for (const target of ['   ', 'server', '#help']) {
      const response = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target }, cookie);
      assert.equal(response.status, 400);
      assert.equal(response.json.message, 'Private-message target is required');
    }
    assert.equal(storage.listQueries(user.id).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('open query rejects non-string payload targets over http', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: {} }, cookie);
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Invalid query payload');
    assert.equal(storage.listQueries(user.id).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('close query returns not found for missing or foreign networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const bobSession = storage.createSession(bob.id);
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  storage.upsertQuery(alice.id, network.id, 'helper');
  const cookie = `pulsete_session=${encodeURIComponent(bobSession.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const missingResponse = await requestJson(port, 'DELETE', '/api/networks/missing/queries/helper', undefined, cookie);
    assert.equal(missingResponse.status, 404);
    assert.equal(missingResponse.json.message, 'Network not found');

    const foreignResponse = await requestJson(port, 'DELETE', `/api/networks/${network.id}/queries/helper`, undefined, cookie);
    assert.equal(foreignResponse.status, 404);
    assert.equal(foreignResponse.json.message, 'Network not found');
    assert.equal(storage.getQuery(alice.id, network.id, 'helper')?.target, 'helper');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('close query rejects invalid private-message targets over http', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  storage.upsertQuery(user.id, network.id, 'helper');
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${network.id}/queries/%23help`, undefined, cookie);
    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Private-message target is required');
    assert.equal(storage.getQuery(user.id, network.id, 'helper')?.target, 'helper');
  } finally {
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
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;

  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', `/api/networks/${network.id}/connect`, undefined, cookie);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed request targets return a handled bad request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    const response = await sendRawRequest(
      port,
      'GET http://% HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
    );
    assert.match(response, /^HTTP\/1\.1 400 Bad Request/m);
    assert.match(response, /Invalid request target/);
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

test('malformed session cookies are ignored by auth routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.bootstrapUser('alice', 'secret');
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const sessionResponse = await sendRawRequest(
      port,
      [
        'GET /api/session HTTP/1.1',
        'Host: 127.0.0.1',
        'Cookie: pulsete_session=%E0%A4%A',
        'Connection: close',
        '',
        '',
      ].join('\r\n')
    );
    assert.match(sessionResponse, /^HTTP\/1\.1 200 OK/m);
    assert.match(sessionResponse, /"bootstrapped":true/);
    assert.match(sessionResponse, /"authenticated":false/);

    const logoutResponse = await sendRawRequest(
      port,
      [
        'POST /api/logout HTTP/1.1',
        'Host: 127.0.0.1',
        'Cookie: pulsete_session=%E0%A4%A',
        'Content-Length: 0',
        'Connection: close',
        '',
        '',
      ].join('\r\n')
    );
    assert.match(logoutResponse, /^HTTP\/1\.1 200 OK/m);
    assert.match(logoutResponse, /{"ok":true}/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed encoded route params return a handled bad request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const connectResponse = await requestJson(port, 'POST', '/api/networks/%E0%A4%A/connect', {}, cookie);
    assert.equal(connectResponse.status, 400);
    assert.equal(connectResponse.json.message, 'Invalid request parameter');

    const deleteResponse = await requestJson(port, 'DELETE', `/api/networks/${network.id}/queries/%E0%A4%A`, undefined, cookie);
    assert.equal(deleteResponse.status, 400);
    assert.equal(deleteResponse.json.message, 'Invalid request parameter');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed websocket session cookies do not crash the upgrade handler', async () => {
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
        'GET /ws HTTP/1.1',
        'Host: 127.0.0.1',
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        'Cookie: pulsete_session=%E0%A4%A',
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

test('slow authenticated writes are revalidated before commit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime }));
  const port = await listen(server);
  const body = JSON.stringify({
    name: 'RaceNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'Alice Example',
    favorite: false,
    autoJoin: [],
  });
  const splitAt = Math.floor(body.length / 2);

  try {
    const socket = net.connect(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    const responsePromise = new Promise<string>((resolve, reject) => {
      let rawResponse = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => { rawResponse += chunk; });
      socket.on('end', () => resolve(rawResponse));
      socket.on('close', () => resolve(rawResponse));
      socket.on('error', reject);
    });

    socket.write(
      `POST /api/networks HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\nCookie: ${cookie}\r\n\r\n${body.slice(0, splitAt)}`
    );

    const logoutResponse = await requestJson(port, 'POST', '/api/logout', undefined, cookie);
    assert.equal(logoutResponse.status, 200);

    socket.write(body.slice(splitAt));
    socket.end();

    const rawResponse = await responsePromise;
    assert.match(rawResponse, /^HTTP\/1\.1 401 /);
    assert.match(rawResponse, /"message":"Authentication required"/);
    assert.equal(storage.listNetworks(user.id).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized websocket payloads are rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: 'x'.repeat(70_000),
    }));
    const close = await waitForWebSocketCloseDetails(socket);
    assert.equal(close.code, 1009);
  } finally {
    socket.terminate();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket session requests and command routing use the live session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  storage.upsertQuery(user.id, network.id, 'helper');

  const runtime = new Runtime(storage);
  const calls: string[] = [];
  runtime.connect = ((nextUserId: string, networkId: string) => {
    calls.push(`connect:${nextUserId}:${networkId}`);
  }) as Runtime['connect'];
  runtime.disconnect = ((nextUserId: string, networkId: string) => {
    calls.push(`disconnect:${nextUserId}:${networkId}`);
  }) as Runtime['disconnect'];
  runtime.closeQuery = ((nextUserId: string, networkId: string, target: string) => {
    calls.push(`query.close:${nextUserId}:${networkId}:${target}`);
    return target;
  }) as Runtime['closeQuery'];
  runtime.sendRaw = ((nextUserId: string, networkId: string, raw: string) => {
    calls.push(`raw.send:${nextUserId}:${networkId}:${raw}`);
  }) as Runtime['sendRaw'];

  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'session.init', token: null }));
    const initReady = await waitForWebSocketMessageType(socket, 'session.ready');
    assert.equal((initReady.snapshot as { user: { username: string } }).user.username, 'alice');

    socket.send(JSON.stringify({ type: 'state.request' }));
    const stateReady = await waitForWebSocketMessageType(socket, 'session.ready');
    assert.equal((stateReady.snapshot as { user: { username: string } }).user.username, 'alice');

    socket.send(JSON.stringify({ type: 'network.connect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'network.disconnect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'query.close', networkId: network.id, target: 'helper' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'query.close'), {
      type: 'query.close',
      networkId: network.id,
      target: 'helper',
    });
    socket.send(JSON.stringify({ type: 'raw.send', networkId: network.id, raw: '/quote WHOIS alice' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(calls, [
      `connect:${user.id}:${network.id}`,
      `disconnect:${user.id}:${network.id}`,
      `query.close:${user.id}:${network.id}:helper`,
      `raw.send:${user.id}:${network.id}:/quote WHOIS alice`,
    ]);
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('logout revokes existing websocket sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'state.request' }));
    assert.equal((await waitForWebSocketMessageType(socket, 'session.ready')).type, 'session.ready');

    const logout = await request(port, '/api/logout', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(logout.status, 200);
    await waitForWebSocketClose(socket);
  } finally {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel.part over websocket returns an error for foreign networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const bobSession = storage.createSession(bob.id);
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(bobSession.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'channel.part', networkId: network.id, channel: '#help' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Network not found',
    });
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel.join over websocket rejects invalid channel names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: 'helper' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Channel name must start with #, &, +, or !',
    });
    assert.equal(storage.listChannels(user.id).length, 0);
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel.part over websocket rejects invalid channel names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'channel.part', networkId: network.id, channel: 'helper' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Channel name must start with #, &, +, or !',
    });
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('query.open over websocket rejects invalid private-message targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: '#help' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Private-message target is required',
    });
    assert.equal(storage.listQueries(user.id).length, 0);
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('query.close over websocket rejects invalid private-message targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  storage.upsertQuery(user.id, network.id, 'helper');
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'query.close', networkId: network.id, target: '#help' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Private-message target is required',
    });
    assert.equal(storage.getQuery(user.id, network.id, 'helper')?.target, 'helper');
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('message.send over websocket rejects invalid private-message targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: '   ', body: 'hello', kind: 'message' }));
    assert.deepEqual(await waitForWebSocketMessageType(socket, 'error'), {
      type: 'error',
      networkId: null,
      message: 'Private-message target is required',
    });
    assert.equal(storage.listQueries(user.id).length, 0);
    assert.equal(storage.listMessages(user.id, network.id, '   ', 10).length, 0);
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel read returns not found for missing or foreign channels', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const bobSession = storage.createSession(bob.id);
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const channel = storage.upsertChannel(alice.id, {
    networkId: network.id,
    name: '#help',
    unread: 2,
  });
  const cookie = `pulsete_session=${encodeURIComponent(bobSession.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const missingResponse = await requestJson(port, 'POST', '/api/channels/missing/read', {}, cookie);
    assert.equal(missingResponse.status, 404);
    assert.equal(missingResponse.json.message, 'Channel not found');

    const foreignResponse = await requestJson(port, 'POST', `/api/channels/${channel.id}/read`, {}, cookie);
    assert.equal(foreignResponse.status, 404);
    assert.equal(foreignResponse.json.message, 'Channel not found');
    assert.equal(storage.getChannel(alice.id, channel.id)?.unread, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel unread snapshots stay in sync across websocket events and http read clears', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const channel = storage.upsertChannel(user.id, {
    networkId: network.id,
    name: '#help',
    unread: 0,
  });
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const socket = await connectWebSocket(port, cookie);

  try {
    const unreadSnapshotPromise = waitForWebSocketMessageType(socket, 'channel.snapshot');
    handleRuntimeEvent(runtime, user.id, {
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

    const unreadSnapshot = await unreadSnapshotPromise as {
      type: 'channel.snapshot';
      channel: { id: string; unread: number };
    };
    assert.equal(unreadSnapshot.channel.id, channel.id);
    assert.equal(unreadSnapshot.channel.unread, 1);

    const clearedSnapshotPromise = waitForWebSocketMessageType(socket, 'channel.snapshot');
    const response = await requestJson(port, 'POST', `/api/channels/${channel.id}/read`, {}, cookie);
    assert.equal(response.status, 200);

    const clearedSnapshot = await clearedSnapshotPromise as {
      type: 'channel.snapshot';
      channel: { id: string; unread: number };
    };
    assert.equal(clearedSnapshot.channel.id, channel.id);
    assert.equal(clearedSnapshot.channel.unread, 0);
  } finally {
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('history clamps invalid and oversized limits to the default window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('alice', 'secret');
  const session = storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  for (let index = 0; index < 250; index += 1) {
    storage.appendMessage(user.id, {
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
  const cookie = `pulsete_session=${encodeURIComponent(session.token)}`;
  const server = createServer(createHttpHandler({ storage, runtime: new Runtime(storage) }));
  const port = await listen(server);

  try {
    const invalidLimit = await fetch(`http://127.0.0.1:${port}/api/networks/${network.id}/history?target=%23help&limit=-1`, {
      headers: { Cookie: cookie },
    });
    const invalidBody = await invalidLimit.json() as { messages: Array<{ body: string }> };
    assert.equal(invalidLimit.status, 200);
    assert.equal(invalidBody.messages.length, historyWindowLimit);
    assert.equal(invalidBody.messages[0]?.body, 'message 0');
    assert.equal(invalidBody.messages.at(-1)?.body, 'message 249');

    const oversizedLimit = await fetch(`http://127.0.0.1:${port}/api/networks/${network.id}/history?target=%23help&limit=1000000`, {
      headers: { Cookie: cookie },
    });
    const oversizedBody = await oversizedLimit.json() as { messages: Array<{ body: string }> };
    assert.equal(oversizedLimit.status, 200);
    assert.equal(oversizedBody.messages.length, historyWindowLimit);
    assert.equal(oversizedBody.messages[0]?.body, 'message 0');
    assert.equal(oversizedBody.messages.at(-1)?.body, 'message 249');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
