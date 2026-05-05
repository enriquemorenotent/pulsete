import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommandPaletteEntrySpecs,
  runCommandPaletteAction,
} from '../web/src/command-palette.js';
import {
  buildPaletteInput,
  channelBuffer,
  friend,
  network,
} from './helpers/command-palette-fixtures.js';

test('command palette builds buffers, watchlist entries, and current-buffer actions in order', () => {
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    actions: {
      canToggleChannelAutoJoin: true,
      channelAutoJoinActive: false,
      canDownloadHistory: true,
    },
  }));

  assert.deepEqual(
    entries.map((entry) => `${entry.section}:${entry.label}`),
    [
      'buffers:Cuff-Link',
      'buffers:#help',
      'buffers:Nathe',
      'buffers:#pending',
      'friends:Joby',
      'actions:Preferences',
      'actions:Search Logs',
      'actions:Network Manager',
      'actions:List Channels',
      'actions:Enable Autojoin',
      'actions:Download History',
    ],
  );
});

test('command palette keeps watchlist nick emoji separate from searchable labels', () => {
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    nickEmojis: [{ id: 'nick-emoji-1', networkId: network.id, nick: friend.nick, emoji: '🌙' }],
  }));
  const friendEntry = entries.find((entry) => entry.id === `friend:${friend.id}`);

  assert.equal(friendEntry?.label, friend.nick);
  assert.equal(friendEntry?.emoji, '🌙');

  const ambiguousEntries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    nickEmojis: [
      { id: 'nick-emoji-1', networkId: network.id, nick: friend.nick, emoji: '🌙' },
      { id: 'nick-emoji-2', networkId: 'network-2', nick: friend.nick, emoji: '⭐' },
    ],
  }));
  const ambiguousFriendEntry = ambiguousEntries.find((entry) => entry.id === `friend:${friend.id}`);
  assert.equal(ambiguousFriendEntry?.emoji, null);
});

test('command palette action dispatcher routes each action to the matching handler', async () => {
  const calls: string[] = [];
  const handlers = {
    selectNetwork: (networkId: string) => { calls.push(`network:${networkId}`); },
    selectBuffer: (bufferId: string) => { calls.push(`buffer:${bufferId}`); },
    selectPendingChannel: (networkId: string, channel: string) => { calls.push(`pending:${networkId}:${channel}`); },
    selectFriend: async (friendId: string) => { calls.push(`friend:${friendId}`); },
    openPreferences: () => { calls.push('preferences'); },
    openLogInspector: () => { calls.push('logs'); },
    openNetworkManager: () => { calls.push('network-manager'); },
    openChannelList: () => { calls.push('channel-list'); },
    toggleCurrentChannelAutoJoin: () => { calls.push('autojoin'); },
    downloadBufferHistory: (bufferId: string) => { calls.push(`download:${bufferId}`); },
  };

  await runCommandPaletteAction(
    { kind: 'select-pending-channel', networkId: network.id, channel: '#pending' },
    handlers,
  );
  await runCommandPaletteAction(
    { kind: 'download-buffer-history', bufferId: channelBuffer.id },
    handlers,
  );
  await runCommandPaletteAction({ kind: 'open-preferences' }, handlers);
  await runCommandPaletteAction({ kind: 'open-log-inspector' }, handlers);
  await runCommandPaletteAction({ kind: 'select-friend', friendId: friend.id }, handlers);

  assert.deepEqual(calls, [
    `pending:${network.id}:#pending`,
    `download:${channelBuffer.id}`,
    'preferences',
    'logs',
    `friend:${friend.id}`,
  ]);
});
