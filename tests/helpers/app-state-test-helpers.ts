import type { AppSnapshot } from '../../shared/protocol-app.js';
import type { BufferState, ChatMessage, FriendState, NetworkProfile, PendingChannelState } from '../../shared/protocol-chat.js';
import { initialState } from '../../web/src/app-state.js';
import type { State } from '../../web/src/app-types.js';
import { defaultWorkspacePreferences } from '../../shared/protocol-preferences.js';

export const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? false,
  name: overrides.name ?? 'Libera.Chat',
  host: overrides.host ?? 'irc.libera.chat',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? ['tester_', 'tester__'],
  realName: overrides.realName ?? 'tester',
  hasPassword: overrides.hasPassword ?? false,
  authMethod: overrides.authMethod ?? 'none',
  authTarget: overrides.authTarget ?? 'NickServ',
  authAccount: overrides.authAccount ?? '',
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

export const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

export const makeFriend = (overrides: Partial<FriendState> = {}): FriendState => ({
  id: overrides.id ?? 'friend-1',
  nick: overrides.nick ?? 'alice',
});

export const makePendingChannel = (overrides: Partial<PendingChannelState> = {}): PendingChannelState => ({
  networkId: overrides.networkId ?? 'network-1',
  channel: overrides.channel ?? '#help',
});

export const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => {
  const networkId = overrides.networkId ?? 'network-1';
  const target = overrides.target ?? '#help';
  return {
    id: overrides.id ?? 'message-1',
    bufferId: overrides.bufferId ?? `${networkId}:${target.toLowerCase()}`,
    networkId,
    target,
    nick: overrides.nick ?? 'alice',
    ...(overrides.delivery ? { delivery: overrides.delivery } : {}),
    ...(overrides.pinnedAt !== undefined ? { pinnedAt: overrides.pinnedAt } : {}),
    body: overrides.body ?? 'hello',
    kind: overrides.kind ?? 'line',
    self: overrides.self ?? false,
    ts: overrides.ts ?? 1,
  };
};

export const emptySnapshot = (): AppSnapshot => ({
  networks: [],
  friends: [],
  nickEmojis: [],
  mutedNicks: [],
  friendPresence: {},
  queryPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: [],
  networkStates: {},
  preferences: defaultWorkspacePreferences,
  userAvatarOverrides: [],
  drafts: [],
  browserStorageImportPending: false,
});

export const makeState = (overrides: {
  domain?: Partial<State['domain']>;
  transient?: Partial<State['transient']>;
} = {}): State => ({
  ...initialState,
  domain: {
    ...initialState.domain,
    ...overrides.domain,
  },
  transient: {
    ...initialState.transient,
    ...overrides.transient,
  },
});
