import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiRequestError, ApiResponseError, requestJson, requestResponse, readJsonResponse } from '../web/src/api-request.js';
import { api } from '../web/src/client.js';
import { aiAssistantApi } from '../web/src/ai-assistant-client.js';
import { downloadFullBackup, importFullBackup } from '../web/src/backup-client.js';

test('all client paths share HTTP error handling and preserve status', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"message":"Unavailable"}', { status: 503 }));
  const calls = [
    () => api.loadHistory('a'),
    () => api.downloadBufferHistory('a'),
    () => aiAssistantApi.status(),
    () => aiAssistantApi.ask('a', {} as Parameters<typeof aiAssistantApi.ask>[1]),
    () => downloadFullBackup(),
    () => importFullBackup(new Blob(['backup'])),
  ];
  for (const call of calls) {
    await assert.rejects(call, error => error instanceof ApiRequestError && error.status === 503 && error.message === 'Unavailable');
  }
});

test('unreadable or unsuitable error bodies fall back to HTTP status', async t => {
  for (const body of ['<html>Error</html>', '', 'null', '{"message":42}', '{"message":" "}']) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 502 }));
    await assert.rejects(requestJson('/api/test'), error => error instanceof ApiRequestError && error.message === 'Request failed (502)');
    mock.mock.restore();
  }
});

test('malformed successful JSON is rejected across main, assistant and backup clients', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('broken JSON'));
  for (const call of [
    () => api.loadHistory('a'),
    () => aiAssistantApi.status(),
    () => aiAssistantApi.ask('a', {} as Parameters<typeof aiAssistantApi.ask>[1]),
    // No browser stubs: a malformed import must fail before restoring preferences or reloading.
    () => importFullBackup(new Blob(['backup'])),
  ]) await assert.rejects(call, ApiResponseError);
});

test('JSON requests preserve supplied headers, cancellation, and binary upload bodies', async t => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_path: unknown, init: RequestInit) => {
    requests.push(init);
    return new Response('{"ok":true}');
  });
  const signal = new AbortController().signal;
  for (const headers of [new Headers({ 'X-Test': 'yes' }), [['X-Test', 'yes']], { 'X-Test': 'yes' }] as HeadersInit[]) {
    assert.deepEqual(await requestJson('/api/test', { method: 'POST', headers, body: '{}', signal }), { ok: true });
    const sent = requests.at(-1)!;
    assert.equal(new Headers(sent.headers).get('X-Test'), 'yes');
    assert.equal(new Headers(sent.headers).get('Content-Type'), 'application/json');
    assert.equal(sent.signal, signal);
  }
  const body = new Blob(['backup']);
  await requestJson('/api/test', { method: 'POST', body });
  assert.equal(requests.at(-1)!.body, body);
  assert.equal(new Headers(requests.at(-1)!.headers).has('Content-Type'), false);
  await requestJson('/api/test', { body: '{}', headers: { 'Content-Type': 'custom/type' } });
  assert.equal(new Headers(requests.at(-1)!.headers).get('Content-Type'), 'custom/type');
});

test('successful raw responses remain readable and assistant streaming still delivers progress', async t => {
  const response = new Response('file contents');
  const mock = t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await requestResponse('/download'), response);
  assert.equal(response.bodyUsed, false);
  assert.equal(await response.text(), 'file contents');
  mock.mock.restore();
  t.mock.method(globalThis, 'fetch', async () => new Response(
    '{"type":"progress","stage":"reading"}\n{"type":"result","response":{"answer":"Hello"}}\n',
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  ));
  const stages: string[] = [];
  const result = await aiAssistantApi.ask('a', {} as Parameters<typeof aiAssistantApi.ask>[1], undefined, stage => stages.push(stage));
  assert.deepEqual(stages, ['reading']);
  assert.equal(result.answer, 'Hello');
});

test('transport and cancellation errors keep their identity', async t => {
  const aborted = new DOMException('Cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => { throw aborted; });
  await assert.rejects(requestJson('/api/test'), error => error === aborted);
  const response = new Response('');
  t.mock.method(response, 'json', async () => { throw aborted; });
  await assert.rejects(readJsonResponse(response), error => error === aborted);
});
