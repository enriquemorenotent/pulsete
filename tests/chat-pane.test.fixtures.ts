import type { BufferState, ChannelState, ChannelUserState, ChatMessage, NetworkProfile } from '../shared/protocol-chat.js';
import type { ChannelListState } from '../web/src/app-types.js';
import type { WorkspaceView } from '../web/src/workspace.js';

export const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

export const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'channel',
  target: overrides.target ?? '#help',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

export const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'channel-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? 'Help channel',
  users: overrides.users ?? [],
});

export const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick === undefined ? 'Joby' : overrides.nick,
  body: overrides.body ?? 'hello there',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

export const closedChannelList: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  totalEntries: null,
  truncated: false,
  error: null,
};

export const makeWorkspace = (
  overrides: Partial<{ channelUsers: ChannelUserState[]; topic: string }> = {},
): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer();
  const selectedChannel = makeChannel({
    id: selectedBuffer.id,
    networkId: selectedBuffer.networkId,
    name: selectedBuffer.target,
    topic: overrides.topic,
    users: overrides.channelUsers ?? [],
  });
  return {
    mode: 'channel-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    workspaceNetworks: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel,
    selectedPendingChannel: null,
    headerTitle: selectedChannel.name,
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'normal',
    composerPlaceholder: `Message ${selectedChannel.name}`,
    emptyBody: 'No history yet.',
    showNicklist: true,
  };
};

export const makeQueryWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ kind: 'query', target: 'MissD' });
  return {
    mode: 'query-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    workspaceNetworks: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: selectedBuffer.target,
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'normal',
    composerPlaceholder: `Message ${selectedBuffer.target}`,
    emptyBody: 'No history yet.',
    showNicklist: false,
  };
};

export const makeServerWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ kind: 'server', target: 'server' });
  return {
    mode: 'server-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    workspaceNetworks: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: 'Server',
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'commands',
    composerPlaceholder: 'Send an IRC command',
    emptyBody: 'No server messages yet.',
    showNicklist: false,
  };
};
