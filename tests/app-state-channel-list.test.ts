import assert from 'node:assert/strict';
import test from 'node:test';
import { channelListEntryLimit } from '../shared/channel-list.js';
import { initialState,reducer } from '../web/src/app-state.js';
import type { ChannelListEntry } from '../shared/protocol.js';

test('channel list reducer appends entry batches and completion metadata', () => {
  const state = startChannelList();
  const next = reducer(state, {
    type: 'channel-list-entries',
    networkId: 'network-1',
    requestId: 'request-1',
    entries: [
      { name: '#help', users: 42, topic: 'Support' },
      { name: '#ops', users: 7, topic: 'Operators' },
    ],
  });
  const completed = reducer(next, {
    type: 'channel-list-completed',
    networkId: 'network-1',
    requestId: 'request-1',
    totalEntries: 2,
    truncated: false,
  });

  assert.deepEqual(next.transient.channelList.entries.map((entry) => entry.name), ['#help', '#ops']);
  assert.equal(next.transient.channelList.totalEntries, 2);
  assert.equal(completed.transient.channelList.status, 'ready');
  assert.equal(completed.transient.channelList.truncated, false);
});

test('channel list reducer ignores stale entry batches', () => {
  const state = startChannelList();
  const next = reducer(state, {
    type: 'channel-list-entries',
    networkId: 'network-1',
    requestId: 'stale-request',
    entries: [{ name: '#help', users: 42, topic: 'Support' }],
  });

  assert.equal(next.transient.channelList.entries.length, 0);
});

test('channel list reducer caps retained entries defensively', () => {
  const state = startChannelList();
  const entries = Array.from({ length: channelListEntryLimit + 2 }, (_, index): ChannelListEntry => ({
    name: `#chan${index + 1}`,
    users: index + 1,
    topic: `Topic ${index + 1}`,
  }));
  const next = reducer(state, {
    type: 'channel-list-entries',
    networkId: 'network-1',
    requestId: 'request-1',
    entries,
  });

  assert.equal(next.transient.channelList.entries.length, channelListEntryLimit);
  assert.equal(next.transient.channelList.entries.at(-1)?.name, `#chan${channelListEntryLimit}`);
  assert.equal(next.transient.channelList.totalEntries, channelListEntryLimit + 2);
  assert.equal(next.transient.channelList.truncated, true);
});

const startChannelList = () => {
  const opened = reducer(initialState, { type: 'open-channel-list', networkId: 'network-1' });
  return reducer(opened, {
    type: 'channel-list-started',
    networkId: 'network-1',
    requestId: 'request-1',
  });
};
