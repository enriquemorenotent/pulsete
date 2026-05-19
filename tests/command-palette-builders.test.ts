import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommandPaletteEntrySpecs,
  runCommandPaletteAction,
} from '../web/src/command-palette.js';
import {
  buildPaletteInput,
  channelBuffer,
  connection,
  friend,
  network,
  queryBuffer,
  serverBuffer,
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

test('command palette promotes unread buffers into a top section without duplicates', () => {
  const unreadChannel = { ...channelBuffer, unread: 7 };
  const priorityQuery = { ...queryBuffer, unread: 1, priorityUnread: 1 };
  const quietChannel = { ...channelBuffer, id: 'buffer-quiet', target: '#quiet' };
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    connections: [{
      ...connection,
      serverBuffer,
      childBuffers: [
        { buffer: unreadChannel, selected: false },
        { buffer: priorityQuery, selected: false },
        { buffer: quietChannel, selected: false },
      ],
    }],
  }));

  assert.deepEqual(
    entries.map((entry) => `${entry.section}:${entry.label}`),
    [
      'unread:Nathe',
      'unread:#help',
      'buffers:Cuff-Link',
      'buffers:#quiet',
      'buffers:#pending',
      'friends:Joby',
      'actions:Preferences',
      'actions:Search Logs',
      'actions:Network Manager',
      'actions:List Channels',
    ],
  );
  assert.deepEqual(
    entries.find((entry) => entry.id === `buffer:${priorityQuery.id}`)?.action,
    { kind: 'select-buffer', bufferId: priorityQuery.id },
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

test('command palette carries server images for network-backed entries', () => {
  const iconUrl = 'data:image/png;base64,cHVsc2V0ZQ==';
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    connections: [{
      ...connection,
      network: { ...network, iconUrl },
      runtime: {
        phase: 'offline',
        serverName: connection.runtime?.serverName ?? null,
        nick: connection.runtime?.nick ?? network.nick,
      },
    }],
  }));

  assert.deepEqual(
    entries
      .filter((entry) => entry.id.startsWith('network:')
        || entry.id.startsWith('buffer:')
        || entry.id.startsWith('pending:'))
      .map((entry) => entry.networkIconUrl),
    [iconUrl, iconUrl, iconUrl, iconUrl],
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.id.startsWith('network:')
        || entry.id.startsWith('buffer:')
        || entry.id.startsWith('pending:'))
      .map((entry) => entry.networkIconSource),
    ['explicit', 'explicit', 'explicit', 'explicit'],
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.id.startsWith('network:')
        || entry.id.startsWith('buffer:')
        || entry.id.startsWith('pending:'))
      .map((entry) => entry.networkRuntimePhase),
    ['offline', 'offline', 'offline', 'offline'],
  );
  assert.equal(entries.find((entry) => entry.id === `friend:${friend.id}`)?.networkIconUrl, undefined);
});

test('command palette uses IRCCloud avatar fallbacks for network-backed entries', () => {
  const avatarUrl = 'https://static.irccloud-cdn.com/avatar-redirect/7';
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    externalAvatarsEnabled: true,
    connections: [{
      ...connection,
      network: { ...network, username: 'uid7' },
    }],
  }));

  assert.deepEqual(
    entries
      .filter((entry) => entry.id.startsWith('network:')
        || entry.id.startsWith('buffer:')
        || entry.id.startsWith('pending:'))
      .map((entry) => entry.networkIconUrl),
    [avatarUrl, avatarUrl, avatarUrl, avatarUrl],
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.id.startsWith('network:')
        || entry.id.startsWith('buffer:')
        || entry.id.startsWith('pending:'))
      .map((entry) => entry.networkIconSource),
    ['irccloud-fallback', 'irccloud-fallback', 'irccloud-fallback', 'irccloud-fallback'],
  );
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
