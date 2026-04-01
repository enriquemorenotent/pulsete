import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMutedMessages, findMutedNick } from '../web/src/muted-nick-utils.js';

test('muted nick helpers match IRC nick casing and filter transcript rows', () => {
  const mutedNicks = [{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }];
  const messages = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'missd',
      body: 'hidden',
      kind: 'line' as const,
      self: false,
      ts: 1,
    },
    {
      id: 'message-2',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'Joby',
      body: 'visible',
      kind: 'line' as const,
      self: false,
      ts: 2,
    },
  ];

  assert.equal(findMutedNick(mutedNicks, 'network-1', 'MISSD')?.id, 'mute-1');
  assert.deepEqual(
    filterMutedMessages(messages, mutedNicks).map((message) => message.id),
    ['message-2'],
  );
});
