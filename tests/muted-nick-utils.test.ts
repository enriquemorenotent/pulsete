import assert from 'node:assert/strict';
import test from 'node:test';
import { findMutedNick, isMessageMuted, resolveMutedMessageNick } from '../web/src/muted-nick-utils.js';

test('muted nick helpers match IRC nick casing without filtering transcript rows', () => {
  const mutedNicks = [{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }];
  const mutedMessage = { networkId: 'network-1', nick: 'missd', speakerNick: null };
  const visibleMessage = { networkId: 'network-1', nick: 'Joby', speakerNick: null };

  assert.equal(findMutedNick(mutedNicks, 'network-1', 'MISSD')?.id, 'mute-1');
  assert.equal(isMessageMuted(mutedNicks, mutedMessage), true);
  assert.equal(resolveMutedMessageNick(mutedNicks, mutedMessage), 'MissD');
  assert.equal(isMessageMuted(mutedNicks, visibleMessage), false);
  assert.equal(resolveMutedMessageNick(mutedNicks, visibleMessage), null);
});

test('muted nick helpers fall back to nick when strong identity is unavailable', () => {
  const mutedNicks = [{
    id: 'mute-1',
    networkId: 'network-1',
    nick: 'MissD',
    identity: { kind: 'account' as const, value: 'missd-account' },
  }];
  const mutedMessage = {
    networkId: 'network-1',
    nick: 'missd',
    speakerNick: null,
    senderIdentity: { kind: 'nick' as const, value: 'missd' },
  };

  assert.equal(findMutedNick(mutedNicks, 'network-1', 'MISSD', mutedMessage.senderIdentity)?.id, 'mute-1');
  assert.equal(isMessageMuted(mutedNicks, mutedMessage), true);
  assert.equal(resolveMutedMessageNick(mutedNicks, mutedMessage), 'MissD');
});
