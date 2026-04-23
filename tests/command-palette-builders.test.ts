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

test('command palette builds buffers, friends, and current-buffer actions in order', () => {
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    actions: {
      canToggleChannelAutoJoin: true,
      channelAutoJoinActive: false,
      canDownloadHistory: true,
      canImportHistory: true,
      canOpenSelfAliases: true,
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
      'actions:Network Manager',
      'actions:List Channels',
      'actions:Enable Autojoin',
      'actions:Download History',
      'actions:Import Logs',
      'actions:Self Aliases',
    ],
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
    openNetworkManager: () => { calls.push('network-manager'); },
    openChannelList: () => { calls.push('channel-list'); },
    toggleCurrentChannelAutoJoin: () => { calls.push('autojoin'); },
    downloadBufferHistory: (bufferId: string) => { calls.push(`download:${bufferId}`); },
    openHistoryImport: (bufferId: string) => { calls.push(`import:${bufferId}`); },
    openSelfAliases: (bufferId: string) => { calls.push(`aliases:${bufferId}`); },
  };

  await runCommandPaletteAction(
    { kind: 'select-pending-channel', networkId: network.id, channel: '#pending' },
    handlers,
  );
  await runCommandPaletteAction(
    { kind: 'open-history-import', bufferId: channelBuffer.id },
    handlers,
  );
  await runCommandPaletteAction({ kind: 'open-preferences' }, handlers);
  await runCommandPaletteAction({ kind: 'select-friend', friendId: friend.id }, handlers);

  assert.deepEqual(calls, [
    `pending:${network.id}:#pending`,
    `import:${channelBuffer.id}`,
    'preferences',
    `friend:${friend.id}`,
  ]);
});
