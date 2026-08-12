import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapClientAuthentication } from '../web/src/client-authentication.js';

test('browser bootstrap exchanges and removes a one-time URL credential', async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const replacements: string[] = [];
  await bootstrapClientAuthentication(
    { hash: '#pulsete-bootstrap=one-time-token', pathname: '/chat', search: '?view=all' },
    { replaceState: (_state, _unused, url) => replacements.push(String(url)) },
    (async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  );

  assert.deepEqual(replacements, ['/chat?view=all']);
  assert.equal(requests[0]?.input, '/api/client-auth');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.equal(new Headers(requests[0]?.init?.headers).get('x-pulsete-bootstrap'), 'one-time-token');
});

test('browser reload validates its HttpOnly session without a URL credential', async () => {
  let requestInit: RequestInit | undefined;
  await bootstrapClientAuthentication(
    { hash: '', pathname: '/', search: '' },
    { replaceState: () => assert.fail('reload must not rewrite history') },
    (async (_input, init) => {
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  );

  assert.equal(requestInit?.method, 'GET');
});

test('browser bootstrap fails closed when the server rejects authentication', async () => {
  await assert.rejects(
    bootstrapClientAuthentication(
      { hash: '', pathname: '/', search: '' },
      { replaceState: () => {} },
      (async () => new Response(null, { status: 401 })) as typeof fetch,
    ),
    /client authentication failed/,
  );
});
