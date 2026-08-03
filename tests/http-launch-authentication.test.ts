import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { launchBootstrapFragmentKey, launchBootstrapPath } from '../shared/launch-authentication.js';
import { createHttpHandler } from '../server/http-router.js';
import { createLaunchAuthentication } from '../server/launch-authentication.js';
import { createRuntime } from '../server/runtime.js';
import { startPulseteServer, type PulseteServerHandle } from '../server/server-app.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { listen } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('HTTP API rejects missing and invalid launch credentials without mutating state', async () => {
  const server = await startTestServer();
  try {
    const missing = await fetch(`${server.url}/api/networks`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { message: 'Authentication required' });

    const invalid = await fetch(`${server.url}/api/networks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'pulsete_launch=invalid',
      },
      body: JSON.stringify(createNetworkInput()),
    });
    assert.equal(invalid.status, 401);

    const authenticated = await fetch(`${server.url}/api/networks`, {
      headers: { Cookie: cookieHeader(server) },
    });
    assert.equal(authenticated.status, 200);
    assert.deepEqual(await authenticated.json(), { networks: [] });
  } finally {
    await server.close();
  }
});

test('a credential from an earlier server launch is expired', async () => {
  const previous = await startTestServer();
  const previousCookie = cookieHeader(previous);
  await previous.close();

  const current = await startTestServer();
  try {
    assert.notEqual(previousCookie, cookieHeader(current));
    const response = await fetch(`${current.url}/api/networks`, {
      headers: { Cookie: previousCookie },
    });
    assert.equal(response.status, 401);
  } finally {
    await current.close();
  }
});

test('browser bootstrap exchanges a one-time fragment token for an HttpOnly session cookie', async () => {
  const server = await startTestServer();
  try {
    const bootstrapUrl = new URL(server.createBrowserBootstrapUrl());
    const token = new URLSearchParams(bootstrapUrl.hash.slice(1))
      .get(launchBootstrapFragmentKey);
    assert.ok(token);
    assert.equal(bootstrapUrl.origin, server.url);
    assert.equal(bootstrapUrl.pathname, '/');
    assert.equal(bootstrapUrl.search, '');
    assert.equal(
      bootstrapUrl.toString().includes(server.getAuthenticationCookie().value),
      false,
    );
    assert.throws(
      () => server.createBrowserBootstrapUrl('https://example.com'),
      /exact local HTTP origin/,
    );

    const missingOrigin = await postBootstrap(server, token);
    assert.equal(missingOrigin.status, 403);

    const invalid = await postBootstrap(server, 'invalid', server.url);
    assert.equal(invalid.status, 401);
    assert.equal(invalid.headers.get('set-cookie'), null);

    const accepted = await postBootstrap(server, token, server.url);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    const setCookie = accepted.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /^pulsete_launch=[A-Za-z0-9_-]{43};/);
    assert.match(setCookie, /; HttpOnly/);
    assert.match(setCookie, /; SameSite=Strict/);
    assert.match(setCookie, /; Path=\//);
    assert.doesNotMatch(setCookie, /Expires=|Max-Age=/i);

    const authenticated = await fetch(`${server.url}/api/networks`, {
      headers: { Cookie: setCookie.split(';', 1)[0] },
    });
    assert.equal(authenticated.status, 200);

    const reused = await postBootstrap(server, token, server.url);
    assert.equal(reused.status, 401);
  } finally {
    await server.close();
  }
});

test('WebSocket authenticates before opening or emitting state.ready', async () => {
  const previous = await startTestServer();
  const previousCookie = cookieHeader(previous);
  await previous.close();

  const server = await startTestServer();
  try {
    assert.equal(await getWebSocketHandshakeStatus(server.url), 401);
    assert.equal(
      await getWebSocketHandshakeStatus(server.url, 'pulsete_launch=invalid'),
      401,
    );
    assert.equal(await getWebSocketHandshakeStatus(server.url, previousCookie), 401);

    const connection = await connectAuthenticatedWebSocket(server.url, cookieHeader(server));
    assert.equal(connection.ready.type, 'state.ready');
    await closeWebSocket(connection.socket);
  } finally {
    await server.close();
  }
});

test('rejected WebSocket authentication does not attach to or read runtime state', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'pulsete-launch-authentication-order-'));
  const storage = new Storage(join(dataDirectory, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const authentication = createLaunchAuthentication();
  let attachCalls = 0;
  let snapshotCalls = 0;
  const websocketContext = {
    ...runtime.ws,
    attachSocket(socket: WebSocket) {
      attachCalls += 1;
      runtime.ws.attachSocket(socket);
    },
    snapshot() {
      snapshotCalls += 1;
      return runtime.ws.snapshot();
    },
  };
  const httpServer = createServer(createHttpHandler(runtime.http, { authentication }));
  attachWebSocketServer(httpServer, websocketContext, { authentication });
  const port = await listen(httpServer);

  try {
    const status = await getWebSocketHandshakeStatus(`http://127.0.0.1:${port}`);
    assert.equal(status, 401);
    assert.equal(attachCalls, 0);
    assert.equal(snapshotCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())));
    storage.close();
  }
});

const startTestServer = () => startPulseteServer({
  dataDirectory: mkdtempSync(join(tmpdir(), 'pulsete-launch-authentication-')),
  host: '127.0.0.1',
  port: 0,
});

const cookieHeader = (server: PulseteServerHandle) =>
  formatCookie(server.getAuthenticationCookie());

const formatCookie = (cookie: { name: string; value: string }) =>
  `${cookie.name}=${cookie.value}`;

const postBootstrap = (
  server: PulseteServerHandle,
  token: string,
  origin?: string,
) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) {
    headers.Origin = origin;
  }
  return fetch(`${server.url}${launchBootstrapPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
};

const getWebSocketHandshakeStatus = (serverUrl: string, cookie?: string) =>
  new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(
      serverUrl.replace(/^http/, 'ws') + '/ws',
      cookie ? { headers: { Cookie: cookie } } : undefined,
    );
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    socket.once('open', () => {
      socket.close();
      resolve(101);
    });
    socket.once('error', reject);
  });

const connectAuthenticatedWebSocket = (serverUrl: string, cookie: string) =>
  new Promise<{ ready: Record<string, unknown>; socket: WebSocket }>((resolve, reject) => {
    const socket = new WebSocket(serverUrl.replace(/^http/, 'ws') + '/ws', {
      headers: { Cookie: cookie },
    });
    socket.once('error', reject);
    socket.on('message', (payload) => {
      const message = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (message.type === 'state.ready') {
        resolve({ ready: message, socket });
      }
    });
  });

const closeWebSocket = (socket: WebSocket) => new Promise<void>((resolve) => {
  socket.once('close', () => resolve());
  socket.close();
});
