import type { ChatMessage, MessageDelivery, SpeakerAttributionConfidence, SpeakerAttributionSource, SpeakerRole } from '../shared/protocol-chat.js';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import type { BufferState, ChannelState, ChannelUserState, FriendState, MutedNickState, NickEmojiState } from '../shared/protocol-chat.js';
import { parseChannelUser, sortChannelUsers } from '../shared/channel-users.js';
import type { SecretBox } from './network-secret.js';
import type {
  BufferRow,
  ChannelRow,
  FriendRow,
  MessageRow,
  MutedNickRow,
  NetworkRow,
  NickEmojiRow,
  RuntimeNetworkProfile,
} from './storage-types.js';
import {
  identityFromNick,
  normalizeNetworkUserIdentity,
  type NetworkUserIdentity,
} from '../shared/user-identity.js';

export const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseChannelUsers = (value: string) => {
  const parsed = parseJson<Array<string | ChannelUserState>>(value, []);
  return sortChannelUsers(parsed.map(parseChannelUser).filter((user): user is ChannelUserState => user !== null));
};

export const toNetworkProfile = (
  row: NetworkRow,
  lists: {
    altNicks: string[];
    historicalSelfNicks: string[];
    autoJoin: string[];
  },
): StoredNetworkProfile => {
  const profile = {
    id: row.id,
    workspaceOpen: Boolean(row.workspaceOpen),
    name: row.name,
    host: row.host,
    port: row.port,
    tls: Boolean(row.tls),
    nick: row.nick,
    username: row.username,
    iconUrl: row.iconUrl || undefined,
    altNicks: lists.altNicks,
    historicalSelfNicks: lists.historicalSelfNicks,
    realName: row.realName,
    hasPassword: Boolean(row.password),
    authMethod: row.authMethod,
    authTarget: row.authTarget,
    authAccount: row.authAccount,
    favorite: Boolean(row.favorite),
    autoJoin: lists.autoJoin,
    notes: row.notes,
  };
  return profile;
};

export const toRuntimeNetworkProfile = (
  row: NetworkRow,
  secretBox: SecretBox,
  lists: {
    altNicks: string[];
    historicalSelfNicks: string[];
    autoJoin: string[];
  },
): RuntimeNetworkProfile => ({
  ...toNetworkProfile(row, lists),
  password: decryptNetworkPassword(row.password, secretBox),
});

export const encryptNetworkPassword = (password: string | undefined, secretBox: SecretBox) =>
  password ? secretBox.encrypt(password) : null;

export const decryptNetworkPassword = (password: string | null, secretBox: SecretBox) =>
  password ? secretBox.decrypt(password) : undefined;

export const toBufferState = (
  row: BufferRow,
  selfNickAliases: string[],
  peerIdentity?: NetworkUserIdentity | null,
): BufferState => ({
  id: row.id,
  networkId: row.networkId,
  unread: row.unread,
  priorityUnread: row.priorityUnread,
  lastReadTs: row.lastReadTs,
  lastReadMessageId: row.lastReadMessageId,
  kind: row.kind,
  target: row.target,
  notes: row.notes,
  ...(peerIdentity ? { peerIdentity } : {}),
  ...(row.ircCloudAvatarId ? { ircCloudAvatarId: row.ircCloudAvatarId } : {}),
  selfNickAliases,
});

export const toFriendState = (row: FriendRow): FriendState => ({
  id: row.id,
  nick: row.nick,
});

export const toMutedNickState = (row: MutedNickRow): MutedNickState => ({
  id: row.id,
  networkId: row.networkId,
  nick: row.nick,
  identity: normalizeNetworkUserIdentity({
    kind: row.identityKind,
    value: row.identityValue,
  }) ?? identityFromNick(row.nick),
});

export const toNickEmojiState = (row: NickEmojiRow): NickEmojiState => ({
  id: row.id,
  networkId: row.networkId,
  nick: row.nick,
  identity: normalizeNetworkUserIdentity({
    kind: row.identityKind,
    value: row.identityValue,
  }) ?? identityFromNick(row.nick),
  emoji: row.emoji,
});

export const toChannelState = (
  row: ChannelRow & {
    networkId: string;
    name: string;
  }
): ChannelState => ({
  id: row.id,
  networkId: row.networkId,
  name: row.name,
  topic: row.topic,
  users: parseChannelUsers(row.users),
});

export const toMessage = (row: MessageRow): ChatMessage => {
  const speakerRole = normalizeSpeakerRole(row.speakerRole, row.self);
  const attributionConfidence = normalizeAttributionConfidence(row.attributionConfidence);
  const delivery = normalizeMessageDelivery(row.delivery);
  return {
    id: row.id,
    bufferId: row.bufferId,
    networkId: row.networkId,
    target: row.target,
    nick: row.nick,
    senderIdentity: normalizeNetworkUserIdentity(
      row.senderIdentityKind && row.senderIdentityValue
        ? { kind: row.senderIdentityKind, value: row.senderIdentityValue }
        : null,
    ),
    speakerRole,
    speakerNick: row.speakerNick ?? row.nick,
    attributionSource: normalizeAttributionSource(row.attributionSource),
    attributionConfidence,
    importBatchId: row.importBatchId,
    ...(delivery === 'server-history' ? { delivery } : {}),
    body: row.body,
    kind: row.kind as ChatMessage['kind'],
    self: Boolean(row.self) || (speakerRole === 'self' && attributionConfidence === 'high'),
    ts: row.ts,
  };
};

const normalizeMessageDelivery = (value: string | null): MessageDelivery =>
  value === 'server-history' ? value : 'live';

const normalizeSpeakerRole = (value: string | null, self: number): SpeakerRole =>
  value === 'self' || value === 'peer' || value === 'other' || value === 'unknown'
    ? value
    : self
      ? 'self'
      : 'unknown';

const normalizeAttributionSource = (value: string | null): SpeakerAttributionSource =>
  value === 'runtime'
    || value === 'query-target'
    || value === 'query-alias'
    || value === 'import-alias'
    || value === 'unknown'
    ? value
    : 'unknown';

const normalizeAttributionConfidence = (value: string | null): SpeakerAttributionConfidence =>
  value === 'high' || value === 'low' ? value : 'low';
