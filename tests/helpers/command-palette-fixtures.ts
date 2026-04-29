import type {
  BufferState,
  FriendState,
  NetworkProfile,
  PendingChannelState,
} from '../../shared/protocol.js';
import type { SidebarConnectionView } from '../../web/src/connection-sidebar-view.js';
import type { BuildCommandPaletteEntrySpecsInput } from '../../web/src/command-palette.js';

export const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'Cuff-Link',
  host: 'irc.cuff-link.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  altNicks: ['sofia_', 'sofia__'],
  username: 'sofia',
  realName: 'Sofia',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

export const serverBuffer: BufferState = {
  id: 'buffer-server',
  networkId: network.id,
  kind: 'server',
  target: 'server',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

export const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: network.id,
  kind: 'channel',
  target: '#help',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

export const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: network.id,
  kind: 'query',
  target: 'Nathe',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

export const pendingChannel: PendingChannelState = {
  networkId: network.id,
  channel: '#pending',
};

export const connection: SidebarConnectionView = {
  network,
  runtime: {
    phase: 'connected',
    serverName: 'irc.cuff-link.test',
    nick: network.nick,
  },
  serverBuffer,
  childBuffers: [
    { buffer: channelBuffer, selected: false },
    { buffer: queryBuffer, selected: false },
  ],
  pendingChannels: [{ pendingChannel, selected: false }],
  childBuffersDimmed: false,
  selectedServer: false,
  label: 'Cuff-Link (sofia)',
  labelParts: {
    name: 'Cuff-Link',
    nick: 'sofia',
  },
};

export const friend: FriendState = {
  id: 'friend-1',
  nick: 'Joby',
};

export const otherNetwork: NetworkProfile = {
  ...network,
  id: 'network-2',
  name: 'OtherNet',
  host: 'irc.othernet.test',
  nick: 'lyra',
};

export const buildPaletteInput = (
  overrides: Partial<BuildCommandPaletteEntrySpecsInput> = {},
): BuildCommandPaletteEntrySpecsInput => ({
  connections: [connection],
  friends: [friend],
  nickEmojis: [],
  selectedBuffer: {
    id: channelBuffer.id,
    label: channelBuffer.target,
  },
  selectedNetwork: {
    available: true,
    id: network.id,
    label: network.name,
  },
  actions: {
    canToggleChannelAutoJoin: false,
    channelAutoJoinActive: false,
    canDownloadHistory: false,
    ...overrides.actions,
  },
  ...overrides,
});
