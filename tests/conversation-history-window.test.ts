import assert from 'node:assert/strict';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import { makeBuffer, makeMessage, makeState, makeNetwork } from './helpers/app-state-test-helpers.js';

const buffer = makeBuffer({ id: 'chat', kind: 'query', target: 'alice' });
const messages = Array.from({ length: 3500 }, (_, i) => makeMessage({
  id: String(i), bufferId: buffer.id, ts: Math.floor(i / 3),
}));
const initial = () => makeState({
  domain: { networks: [makeNetwork({ workspaceOpen: true })], buffers: [buffer], messages: { chat: messages.slice(-250) } },
  transient: { selection: { kind: 'buffer', bufferId: 'chat' },
    historyLoadedByBufferId: { chat: true }, historyHasOlderByBufferId: { chat: true } },
});

test('pages through all 3500 messages in both directions while retaining at most 1000', () => {
  let state = initial();
  for (let page = 0; state.transient.historyHasOlderByBufferId.chat && page < 20; page++) {
    const cursor = state.domain.messages.chat![0]!.id;
    const end = Number(cursor);
    state = reducer(state, { type: 'page-message-window', bufferId: 'chat', cursor,
      direction: 'older', messages: messages.slice(Math.max(0, end - 250), end), hasMore: end > 250 });
    assert.ok(state.domain.messages.chat!.length <= 1000);
  }
  assert.equal(state.domain.messages.chat![0]!.id, '0');
  assert.equal(state.transient.historyHasNewerByBufferId.chat, true);
  for (let page = 0; state.transient.historyHasNewerByBufferId.chat && page < 30; page++) {
    const cursor = state.domain.messages.chat!.at(-1)!.id;
    const start = Number(cursor) + 1;
    state = reducer(state, { type: 'page-message-window', bufferId: 'chat', cursor,
      direction: 'newer', messages: messages.slice(start, start + 125), hasMore: start + 125 < messages.length });
    assert.ok(state.domain.messages.chat!.length <= 1000);
  }
  assert.deepEqual(state.domain.messages.chat, messages.slice(-1000));
  assert.equal(state.transient.historyHasOlderByBufferId.chat, true);
});

test('live messages do not create gaps or move a historical window', () => {
  let state = initial();
  const current = messages.slice(0, 1000);
  state = reducer(state, { type: 'replace-message-window', bufferId: 'chat', messages: current,
    hasOlder: false, hasNewer: true });
  for (const type of ['append-message', 'upsert-message'] as const) {
    state = reducer(state, { type, message: messages.at(-1)! });
    assert.deepEqual(state.domain.messages.chat, current);
  }
  const updated = { ...current[10]!, body: 'updated' };
  state = reducer(state, { type: 'upsert-message', message: updated });
  assert.equal(state.domain.messages.chat![10]!.body, 'updated');
});

test('ignores pages whose cursor was replaced or whose conversation was left', () => {
  const state = initial();
  const action = { type: 'page-message-window' as const, bufferId: 'chat', cursor: '0',
    direction: 'older' as const, messages: messages.slice(0, 250), hasMore: false };
  assert.equal(reducer(state, action), state);
  const left = { ...state, transient: { ...state.transient, selection: null } };
  assert.equal(reducer(left, { ...action, cursor: '3250' }), left);
});

test('deduplicates overlapping pages and retains messages received during an older request', () => {
  let state = initial();
  const live = makeMessage({ id: 'live', bufferId: 'chat', ts: 5000 });
  state = reducer(state, { type: 'append-message', message: live });
  state = reducer(state, { type: 'page-message-window', bufferId: 'chat', cursor: '3250',
    direction: 'older', messages: messages.slice(3000, 3260), hasMore: true });
  assert.equal(state.domain.messages.chat!.length, 501);
  assert.equal(state.domain.messages.chat!.at(-1), live);
});
