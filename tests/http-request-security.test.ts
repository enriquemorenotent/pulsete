import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type WebSocket from 'ws';
import { createHttpHandler } from '../server/http-router.js';
import { createRequestOriginPolicy } from '../server/request-origin-policy.js';
import { createRuntime } from '../server/runtime.js';
import { startPulseteServer } from '../server/server-app.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { listen, sendRawRequest } from './helpers/http-request-helpers.js';
import {
  closeWebSocket,
  connectWebSocket,
} from './helpers/http-websocket-test-helpers.js';

const developmentOrigin = 'http://127.0.0.1:18473';
const localhostDevelopmentOrigin = 'http://localhost:18473';

test('origin policy accepts only exact configured origins or a missing Origin header', () => {
  const policy = createRequestOriginPolicy([
    `${developmentOrigin}/`,
    localhostDevelopmentOrigin,
  ]);

  assert.equal(policy.allows(developmentOrigin), true);
  assert.equal(policy.allows(localhostDevelopmentOrigin), true);
  assert.equal(policy.allows(undefined), true);
  assert.equal(policy.allows('https://attacker.example'), false);
  assert.equal(policy.allows(`${developmentOrigin}/path`), false);
  assert.equal(policy.allows('null'), false);
  assert.equal(policy.allows('not an origin'), false);
  assert.throws(
    () => createRequestOriginPolicy([`${developmentOrigin}/path`]),
    /Invalid allowed origin/,
  );
});

test('HTTP API rejects untrusted origins and non-JSON parser inputs without mutations', async () => {
  const context = await createSecurityServer();
  try {
    const trusted = await postFriend(context.port, context.appOrigin, 'Alice');
    assert.equal(trusted.status, 200);

    const untrusted = await postFriend(
      context.port,
      'https://attacker.example',
      'Mallory',
    );
    assert.equal(untrusted.status, 403);
    assert.equal(untrusted.body.message, 'Origin not allowed');

    const malformed = await postFriend(
      context.port,
      `${context.appOrigin}/path`,
      'PathMallory',
    );
    assert.equal(malformed.status, 403);
    assert.equal(malformed.body.message, 'Origin not allowed');

    const unsafeType = await postFriend(
      context.port,
      context.appOrigin,
      'PlainMallory',
      'text/plain',
    );
    assert.equal(unsafeType.status, 415);
    assert.equal(unsafeType.body.message, 'Content-Type must be application/json');

    const development = await postFriend(context.port, developmentOrigin, 'DevUser');
    assert.equal(development.status, 200);

    const localhostDevelopment = await postFriend(
      context.port,
      localhostDevelopmentOrigin,
      'LocalhostDevUser',
    );
    assert.equal(localhostDevelopment.status, 200);

    const missingOrigin = await postFriend(context.port, undefined, 'LocalClient');
    assert.equal(missingOrigin.status, 200);

    const charset = await postFriend(
      context.port,
      context.appOrigin,
      'CharsetUser',
      'application/json; charset=utf-8',
    );
    assert.equal(charset.status, 200);
    assert.deepEqual(
      context.storage.friends.list().map((friend) => friend.nick).sort(),
      ['Alice', 'CharsetUser', 'DevUser', 'LocalClient', 'LocalhostDevUser'],
    );
  } finally {
    await context.close();
  }
});

test('WebSocket rejects bad origins before attaching and preserves trusted clients', async () => {
  const context = await createSecurityServer();
  try {
    const untrusted = await sendWebSocketUpgrade(
      context.port,
      'https://attacker.example',
    );
    assert.match(untrusted, /^HTTP\/1\.1 403 Forbidden/m);
    assert.match(untrusted, /Origin not allowed/);

    const malformed = await sendWebSocketUpgrade(
      context.port,
      `${context.appOrigin}/path`,
    );
    assert.match(malformed, /^HTTP\/1\.1 403 Forbidden/m);
    assert.equal(context.getAttachCalls(), 0);
    assert.equal(context.getSnapshotCalls(), 0);

    for (const origin of [
      context.appOrigin,
      developmentOrigin,
      localhostDevelopmentOrigin,
      undefined,
    ]) {
      const connection = await connectWebSocket(context.port, origin);
      assert.equal(connection.ready.type, 'state.ready');
      await closeWebSocket(connection.socket);
    }
    assert.equal(context.getAttachCalls(), 4);
    assert.equal(context.getSnapshotCalls(), 4);
  } finally {
    await context.close();
  }
});

test('started servers trust their exact dynamic application origin', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'pulsete-server-security-'));
  const server = await startPulseteServer({
    allowedOrigins: [developmentOrigin],
    dataDirectory,
    host: '127.0.0.1',
    port: 0,
  });

  try {
    const authenticationCookie = server.getAuthenticationCookie();
    const cookie = `${authenticationCookie.name}=${authenticationCookie.value}`;
    const appResponse = await fetch(`${server.url}/api/networks`, {
      headers: { Cookie: cookie, Origin: server.url },
    });
    const developmentResponse = await fetch(`${server.url}/api/networks`, {
      headers: { Cookie: cookie, Origin: developmentOrigin },
    });

    assert.equal(appResponse.status, 200);
    assert.equal(developmentResponse.status, 200);
  } finally {
    await server.close();
  }
});

const createSecurityServer = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-request-security-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const originPolicy = createRequestOriginPolicy([
    developmentOrigin,
    localhostDevelopmentOrigin,
  ]);
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
  const server = createServer(createHttpHandler(runtime.http, { originPolicy }));
  attachWebSocketServer(server, websocketContext, { originPolicy });
  const port = await listen(server);
  const appOrigin = `http://127.0.0.1:${port}`;
  originPolicy.addAllowedOrigin(appOrigin);

  return {
    appOrigin,
    getAttachCalls: () => attachCalls,
    getSnapshotCalls: () => snapshotCalls,
    port,
    storage,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())));
      storage.close();
    },
  };
};

const postFriend = async (
  port: number,
  origin: string | undefined,
  nick: string,
  contentType = 'application/json',
) => {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (origin !== undefined) {
    headers.Origin = origin;
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/friends`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nick }),
  });
  return {
    body: await response.json() as { message?: string },
    status: response.status,
  };
};

const sendWebSocketUpgrade = (port: number, origin: string) =>
  sendRawRequest(port, [
    'GET /ws HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Connection: Upgrade',
    'Upgrade: websocket',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    `Origin: ${origin}`,
    '',
    '',
  ].join('\r\n'));
