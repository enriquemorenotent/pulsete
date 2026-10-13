import assert from 'node:assert/strict';
import test from 'node:test';
import type { LogHistorySearchPayload } from '../shared/protocol-chat.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('log search pages tied timestamps without gaps and respects date and conversation filters', async () => {
  const context = await createHttpRuntimeContext();
  try {
    const network = context.storage.networks.upsert(createNetworkInput());
    const append = (id: string, ts: number, target = '#help') => context.storage.conversations.appendMessage({
      id, networkId: network.id, target, ts, nick: 'alice', body: 'needle hi', kind: 'line', self: false,
    });
    append('too-old', 999);
    append('first', 1000);
    append('second', 1000);
    append('third', 1000);
    append('too-new', 2000);
    append('other-conversation', 1000, '#other');
    // Exercise both the FTS and short-term scan implementations through the real API.
    for (const q of ['needle', 'hi']) {
      const params = new URLSearchParams({ q, limit: '2', fromTs: '1000', toTs: '2000', networkId: network.id, target: '#help' });
      const getPage = async () => {
        const response = await fetch(`http://127.0.0.1:${context.port}/api/logs/search?${params}`);
        assert.equal(response.status, 200);
        return await response.json() as LogHistorySearchPayload;
      };
      const first = await getPage();
      assert.deepEqual(first.results.map((result) => result.message.id), ['third', 'second']);
      assert.equal(first.hasMore, true);
      // New arrivals must not shift the cursor and duplicate old results.
      append(`new-arrival-${q}`, 1500);
      params.set('beforeMessageId', 'second');
      const second = await getPage();
      assert.deepEqual(second.results.map((result) => result.message.id), ['first']);
      assert.equal(second.hasMore, false);
      context.storage.conversations.deleteMessagesByIdPrefixes(['new-arrival-']);
    }
  } finally {
    await context.close();
  }
});

test('log search rejects invalid dates and reversed ranges', async () => {
  const context = await createHttpRuntimeContext();
  try {
    for (const params of ['fromTs=bad', 'toTs=Infinity', 'fromTs=', 'fromTs=2000&toTs=1000']) {
      const response = await fetch(`http://127.0.0.1:${context.port}/api/logs/search?q=hello&${params}`);
      assert.equal(response.status, 400);
    }
  } finally {
    await context.close();
  }
});

test('date-only search uses exact conversation scope and pages without a keyword', async () => {
  const context = await createHttpRuntimeContext();
  try {
    const network = context.storage.networks.upsert(createNetworkInput());
    const append = (id: string, target: string, ts: number) => context.storage.conversations.appendMessage({ id, networkId: network.id, target, ts, nick: 'alice', body: 'hello', kind: 'line', self: false });
    const message = append('a', '#help', 1000);
    append('b', '#help', 1100);
    append('collision', '#help-other', 1200);
    append('outside', '#help', 2000);
    const params = new URLSearchParams({ q: '', bufferId: message.bufferId, fromTs: '1000', toTs: '2000', limit: '1' });
    const first = await (await fetch(`http://127.0.0.1:${context.port}/api/logs/search?${params}`)).json() as LogHistorySearchPayload;
    assert.deepEqual(first.results.map(({message}) => message.id), ['b']);
    assert.equal(first.hasMore, true);
    params.set('beforeMessageId', 'b');
    const second = await (await fetch(`http://127.0.0.1:${context.port}/api/logs/search?${params}`)).json() as LogHistorySearchPayload;
    assert.deepEqual(second.results.map(({message}) => message.id), ['a']);
    assert.equal(second.hasMore, false);
  } finally { await context.close(); }
});

test('history window opens unpinned channel messages with both paging directions and rejects another buffer', async () => {
  const context = await createHttpRuntimeContext();
  try {
    const network = context.storage.networks.upsert(createNetworkInput());
    let bufferId = '';
    for (let index = 0; index < 400; index += 1) {
      bufferId = context.storage.conversations.appendMessage({ id: `window-${index}`, networkId: network.id, target: '#help', ts: 1000 + index, nick: 'alice', body: `line ${index}`, kind: 'line', self: false }).bufferId;
    }
    const params = new URLSearchParams({ bufferId, messageId: 'window-200' });
    const response = await fetch(`http://127.0.0.1:${context.port}/api/logs/window?${params}`);
    assert.equal(response.status, 200);
    const page = await response.json() as {messages: {id:string}[]; hasOlder:boolean; hasNewer:boolean; targetMessageId:string};
    assert.equal(page.messages.length, 250);
    assert.equal(page.messages[124]?.id, 'window-200');
    assert.equal(page.hasOlder, true);
    assert.equal(page.hasNewer, true);
    params.set('messageId', page.messages.at(-1)!.id);
    const newer = await (await fetch(`http://127.0.0.1:${context.port}/api/logs/window?${params}`)).json() as typeof page;
    assert.equal(newer.messages.at(-1)?.id, 'window-399');
    assert.equal(newer.hasNewer, false);
    params.set('bufferId', 'another-buffer');
    assert.equal((await fetch(`http://127.0.0.1:${context.port}/api/logs/window?${params}`)).status, 404);
  } finally { await context.close(); }
});
