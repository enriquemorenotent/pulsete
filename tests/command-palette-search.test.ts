import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import type { SidebarConnectionView } from '../web/src/connection-sidebar-view.js';
import {
  buildCommandPaletteEntrySpecs,
  filterCommandPaletteEntries,
  moveCommandPaletteActiveIndex,
  shouldOpenCommandPaletteFromKeydown,
} from '../web/src/command-palette.js';
import {
  buildPaletteInput,
  channelBuffer,
  connection,
  otherNetwork,
  serverBuffer,
} from './helpers/command-palette-fixtures.js';

test('command palette filtering matches labels, subtitles, and keywords case-insensitively', () => {
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    actions: {
      canToggleChannelAutoJoin: false,
      channelAutoJoinActive: false,
      canDownloadHistory: false,
    },
  }));

  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'watched nick').map((entry) => entry.label),
    ['Joby'],
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'people').map((entry) => entry.label),
    ['Joby'],
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'logs').map((entry) => entry.label),
    ['Search Logs'],
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'conversation').map((entry) => entry.label),
    ['Cuff-Link', '#help', 'Nathe', '#pending'],
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'hexchat').map((entry) => entry.label),
    [],
  );
  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'SOFIA').map((entry) => entry.label),
    ['Cuff-Link', '#help', 'Nathe', '#pending'],
  );
});

test('command palette scoring promotes exact matches, then current-network unread buffers', () => {
  const currentHelpDesk: BufferState = { ...channelBuffer, id: 'buffer-helpdesk', target: '#helpdesk', unread: 4 };
  const currentHelper: BufferState = { ...channelBuffer, id: 'buffer-helper', target: '#helper', unread: 0 };
  const otherExact: BufferState = { ...channelBuffer, id: 'buffer-other-help', networkId: otherNetwork.id, target: '#help', unread: 1 };
  const otherHelpDesk: BufferState = { ...channelBuffer, id: 'buffer-other-helpdesk', networkId: otherNetwork.id, target: '#helpdesk', unread: 8 };
  const otherConnection: SidebarConnectionView = {
    ...connection,
    network: otherNetwork,
    runtime: { phase: 'connected', serverName: otherNetwork.host, nick: otherNetwork.nick },
    serverBuffer: { ...serverBuffer, id: 'buffer-server-2', networkId: otherNetwork.id },
    childBuffers: [
      { buffer: otherExact, selected: false },
      { buffer: otherHelpDesk, selected: false },
    ],
    pendingChannels: [],
    label: 'OtherNet (lyra)',
    labelParts: { name: 'OtherNet', nick: 'lyra' },
  };

  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    connections: [{
      ...connection,
      childBuffers: [
        { buffer: currentHelpDesk, selected: false },
        { buffer: currentHelper, selected: false },
      ],
    }, otherConnection],
    selectedBuffer: {
      id: currentHelpDesk.id,
      label: currentHelpDesk.target,
    },
  }));

  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'help').map((entry) => entry.label),
    ['#help', '#helpdesk', '#helpdesk', '#helper'],
  );
});

test('command palette filtering keeps unread matches ahead of every other section', () => {
  const unreadChannel: BufferState = {
    ...channelBuffer,
    target: '#displace',
    unread: 1,
  };
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    actions: {
      canToggleChannelAutoJoin: true,
      channelAutoJoinActive: true,
      canDownloadHistory: false,
    },
    connections: [{
      ...connection,
      childBuffers: [{ buffer: unreadChannel, selected: false }],
    }],
  }));

  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'dis')
      .map((entry) => `${entry.section}:${entry.label}`),
    ['unread:#displace', 'actions:Disable Autojoin'],
  );
});

test('command palette filtering keeps conversation matches ahead of tools', () => {
  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput());

  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'channel')
      .map((entry) => `${entry.section}:${entry.label}`),
    ['buffers:#help', 'buffers:#pending', 'actions:List Channels'],
  );
});

test('command palette navigation and hotkey helpers keep their current behavior', () => {
  assert.equal(moveCommandPaletteActiveIndex(0, 4, -1), 3);
  assert.equal(moveCommandPaletteActiveIndex(3, 4, 1), 0);
  assert.equal(moveCommandPaletteActiveIndex(-1, 4, 1), 0);
  assert.equal(moveCommandPaletteActiveIndex(-1, 0, 1), -1);

  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  }, {
    blockingDialogOpen: false,
    paletteOpen: false,
  }), true);

  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  }, {
    blockingDialogOpen: true,
    paletteOpen: false,
  }), false);

  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: true,
  }, {
    blockingDialogOpen: false,
    paletteOpen: false,
  }), false);
});
