import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialTranscriptScrollLocation as resolve } from '../web/src/transcript/viewport-positioning.js';

const base = { rowKeys: ['a', 'b', 'c'], snapshot: null, unreadRowIndex: 1 };
test('unread startup has a valid initial location without a saved snapshot', () => {
  assert.deepEqual(resolve({ ...base, target: 'first-unread' }), { index: 1, align: 'start' });
});
test('a saved row and pixel offset take precedence over unread startup', () => {
  assert.deepEqual(resolve({ ...base, target: 'first-unread', snapshot: { kind: 'anchor', rowKey: 'c', offset: -12 } }),
    { index: 2, align: 'start', behavior: 'auto', offset: -12 });
});
test('an evicted saved row falls back to the unread location', () => {
  assert.deepEqual(resolve({ ...base, target: 'first-unread', snapshot: { kind: 'anchor', rowKey: 'gone' } }),
    { index: 1, align: 'start' });
});
test('waiting and missing unread positions remain valid while latest starts at the end', () => {
  assert.equal(resolve({ ...base, rowKeys: [], target: 'wait', unreadRowIndex: null }), 0);
  assert.equal(resolve({ ...base, target: 'first-unread', unreadRowIndex: null }), 0);
  assert.deepEqual(resolve({ ...base, target: 'latest' }), { index: 'LAST', align: 'end' });
});
