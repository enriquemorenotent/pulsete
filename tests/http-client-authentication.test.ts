import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createClientAuthentication } from '../server/client-authentication.js';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { startPulseteServer } from '../server/server-app.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { listen } from './helpers/http-request-helpers.js';
import { closeWebSocket } from './helpers/http-websocket-test-helpers.js';

const bootstrapHeader = 'x-pulsete-bootstrap';

const startAuthenticatedServer = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-auth-'));
  const storage = new Storage(join(directory, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const authentication = createClientAuthentication();
  const server = createServer(createHttpHandler(runtime.http, { authentication }));
  attachWebSocketServer(server, runtime.ws, { authentication });
  const port = await listen(server);
  const close = async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    storage.close();
  };
  return { authentication, close, port };
};

const bootstrap = async (port: number, credential: string) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/client-auth`, {
    method: 'POST',
    headers: { [bootstrapHeader]: credential },
  });
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
};

test('production server entrypoint requires its generated per-launch credential', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-server-auth-'));
  const server = await startPulseteServer({
    assetRoot: 'dist',
    dataDirectory: directory,
    host: '127.0.0.1',
    port: 0,
  });
  try {
    const missing = await fetch(`${server.url}/api/logs/sources`);
    const credential = new URL(server.clientUrl).hash.slice('#pulsete-bootstrap='.length);
    const authenticated = await bootstrap(server.port, credential);
    const allowed = await fetch(`${server.url}/api/logs/sources`, {
      headers: { Cookie: authenticated.cookie },
    });

    assert.equal(missing.status, 401);
    assert.equal(authenticated.response.status, 204);
    assert.equal(allowed.status, 200);
  } finally {
    await server.close();
  }
});

test('HTTP APIs reject missing and invalid client credentials before routing', async () => {
  const context = await startAuthenticatedServer();
  try {
    const missing = await fetch(`http://127.0.0.1:${context.port}/api/preferences`);
    const invalid = await fetch(`http://127.0.0.1:${context.port}/api/preferences`, {
      headers: { Cookie: 'pulsete-session=invalid' },
    });

    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { message: 'Client authentication required' });
    assert.equal(invalid.status, 401);
  } finally {
    await context.close();
  }
});

test('single-use bootstrap authenticates normal HTTP requests without exposing the session token', async () => {
  const context = await startAuthenticatedServer();
  try {
    const first = await bootstrap(context.port, context.authentication.bootstrapCredential);
    const reused = await bootstrap(context.port, context.authentication.bootstrapCredential);
    const authenticated = await fetch(`http://127.0.0.1:${context.port}/api/logs/sources`, {
      headers: { Cookie: first.cookie },
    });

    assert.equal(first.response.status, 204);
    assert.match(first.response.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Strict/);
    assert.equal(first.response.headers.get('set-cookie')?.includes(context.authentication.bootstrapCredential), false);
    assert.equal(reused.response.status, 401);
    assert.equal(authenticated.status, 200);
  } finally {
    await context.close();
  }
});

test('WebSocket upgrades reject unauthenticated clients before state is attached', async () => {
  const context = await startAuthenticatedServer();
  try {
    const connectRejected = (cookie?: string) => new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${context.port}/ws`, cookie
        ? { headers: { Cookie: cookie } }
        : undefined);
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      socket.once('error', reject);
    });

    assert.equal(await connectRejected(), 401);
    assert.equal(await connectRejected('pulsete-session=invalid'), 401);
  } finally {
    await context.close();
  }
});

test('authenticated WebSocket clients receive state and credentials expire after restart', async () => {
  const first = await startAuthenticatedServer();
  const bootstrapped = await bootstrap(first.port, first.authentication.bootstrapCredential);
  const socket = new WebSocket(`ws://127.0.0.1:${first.port}/ws`, {
    headers: { Cookie: bootstrapped.cookie },
  });
  try {
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      socket.once('message', (payload) => resolve(JSON.parse(payload.toString()) as Record<string, unknown>));
      socket.once('error', reject);
    });
    assert.equal(ready.type, 'state.ready');
  } finally {
    await closeWebSocket(socket);
    await first.close();
  }

  const restarted = await startAuthenticatedServer();
  try {
    const expired = await fetch(`http://127.0.0.1:${restarted.port}/api/preferences`, {
      headers: { Cookie: bootstrapped.cookie },
    });
    assert.equal(expired.status, 401);
  } finally {
    await restarted.close();
  }
});
