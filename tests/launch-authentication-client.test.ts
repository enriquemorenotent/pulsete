import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBootstrapPath } from '../shared/launch-authentication.js';
import {
  bootstrapLaunchAuthentication,
  takeBootstrapToken,
} from '../web/src/launch-authentication.js';

test('browser bootstrap removes the one-time token before exchanging it', async () => {
  const events: string[] = [];
  const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const historyState = { workspace: 'network-1' };
  const href = 'http://127.0.0.1:18473/#view=chat&pulsete-bootstrap=one-time-token';

  const bootstrapped = await bootstrapLaunchAuthentication({
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      events.push('fetch');
      requests.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    history: {
      state: historyState,
      replaceState(state, _unused, url) {
        events.push('replaceState');
        assert.equal(state, historyState);
        assert.equal(url, 'http://127.0.0.1:18473/#view=chat');
      },
    },
    location: { href },
  });

  assert.equal(bootstrapped, true);
  assert.deepEqual(events, ['replaceState', 'fetch']);
  const request = requests[0];
  assert.ok(request);
  assert.equal(request?.input, launchBootstrapPath);
  assert.equal(request?.init?.method, 'POST');
  assert.equal(request?.init?.credentials, 'same-origin');
  assert.equal(request?.init?.redirect, 'error');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { token: 'one-time-token' });
});

test('browser bootstrap leaves ordinary URLs alone and does not make a request', async () => {
  let fetchCalls = 0;
  const result = await bootstrapLaunchAuthentication({
    fetch: (async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch,
    history: {
      state: null,
      replaceState() {
        assert.fail('history must not change without a bootstrap token');
      },
    },
    location: { href: 'http://127.0.0.1:18473/#view=chat' },
  });

  assert.equal(result, false);
  assert.equal(fetchCalls, 0);
  assert.equal(takeBootstrapToken('http://127.0.0.1:18473/'), null);
});

test('browser bootstrap failures do not repeat the secret in the error', async () => {
  const secret = 'one-time-token-that-must-not-leak';
  await assert.rejects(
    bootstrapLaunchAuthentication({
      fetch: (async () => new Response(null, { status: 401 })) as typeof fetch,
      history: { state: null, replaceState() {} },
      location: {
        href: `http://127.0.0.1:18473/#pulsete-bootstrap=${secret}`,
      },
    }),
    (error: unknown) => error instanceof Error
      && error.message === 'Browser authentication failed (401)'
      && !error.message.includes(secret),
  );
});
