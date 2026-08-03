import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWebSocketUrl } from '../web/src/client-socket.js';

test('resolveWebSocketUrl uses same-origin websocket by default', () => {
  assert.equal(
    resolveWebSocketUrl({ protocol: 'http:', host: 'example.test' }),
    'ws://example.test/ws',
  );
  assert.equal(
    resolveWebSocketUrl({ protocol: 'https:', host: 'example.test' }),
    'wss://example.test/ws',
  );
});

test('resolveWebSocketUrl keeps development websocket traffic same-origin', () => {
  assert.equal(
    resolveWebSocketUrl({ protocol: 'http:', host: '127.0.0.1:18473' }),
    'ws://127.0.0.1:18473/ws',
  );
});
