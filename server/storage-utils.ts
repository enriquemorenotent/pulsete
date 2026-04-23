import type { SpeakerAttributionConfidence, SpeakerAttributionSource, SpeakerRole } from '../shared/protocol.js';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import type { BufferState, ChannelState, ChannelUserState, FriendState, MutedNickState } from '../shared/protocol.js';
import { parseChannelUser, sortChannelUsers } from '../shared/channel-users.js';
import { getLocalIrcIdentity } from '../shared/local-defaults.js';
import type { SecretBox } from './network-secret.js';
import type {
  BufferRow,
  ChannelRow,
  FriendRow,
  MessageInput,
  MessageRow,
  MutedNickRow,
  NetworkInput,
  NetworkRow,
  RuntimeNetworkProfile,
} from './storage-types.js';

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

export const defaultNetworkTemplates = (): NetworkInput[] => {
  const identity = getLocalIrcIdentity();
  return [
    {
      templateId: null,
      managerHidden: false,
      name: 'Libera.Chat',
      host: 'irc.libera.chat',
      port: 6697,
      tls: true,
      nick: identity.nick,
      altNicks: [...identity.altNicks],
      historicalSelfNicks: [],
      username: identity.username,
      realName: identity.realName,
      favorite: true,
      autoJoin: [],
    },
    {
      templateId: null,
      managerHidden: false,
      name: 'OFTC',
      host: 'irc.oftc.net',
      port: 6697,
      tls: true,
      nick: identity.nick,
      altNicks: [...identity.altNicks],
      historicalSelfNicks: [],
      username: identity.username,
      realName: identity.realName,
      favorite: true,
      autoJoin: [],
    },
    {
      templateId: null,
      managerHidden: false,
      name: 'Snoonet',
      host: 'irc.snoonet.org',
      port: 6697,
      tls: true,
      nick: identity.nick,
      altNicks: [...identity.altNicks],
      historicalSelfNicks: [],
      username: identity.username,
      realName: identity.realName,
      favorite: false,
      autoJoin: [],
    },
    {
      templateId: null,
      managerHidden: false,
      name: 'IRCnet',
      host: 'irc.ircnet.com',
      port: 6667,
      tls: false,
      nick: identity.nick,
      altNicks: [...identity.altNicks],
      historicalSelfNicks: [],
      username: identity.username,
      realName: identity.realName,
      favorite: false,
      autoJoin: [],
    },
  ];
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
    templateId: row.templateId,
    managerHidden: Boolean(row.managerHidden),
    name: row.name,
    host: row.host,
    port: row.port,
    tls: Boolean(row.tls),
    nick: row.nick,
    altNicks: lists.altNicks,
    historicalSelfNicks: lists.historicalSelfNicks,
    username: row.username,
    realName: row.realName,
    hasPassword: Boolean(row.password),
    authMethod: row.authMethod,
    authTarget: row.authTarget,
    authAccount: row.authAccount,
    favorite: Boolean(row.favorite),
    autoJoin: lists.autoJoin,
  };
  return profile.managerHidden
    ? profile as Extract<StoredNetworkProfile, { managerHidden: true }>
    : profile as Extract<StoredNetworkProfile, { managerHidden: false }>;
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

export const toBufferState = (row: BufferRow, selfNickAliases: string[]): BufferState => ({
  id: row.id,
  networkId: row.networkId,
  unread: row.unread,
  priorityUnread: row.priorityUnread,
  lastReadTs: row.lastReadTs,
  lastReadMessageId: row.lastReadMessageId,
  kind: row.kind,
  target: row.target,
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

export const toMessage = (row: MessageRow): MessageInput => ({
  id: row.id,
  networkId: row.networkId,
  target: row.target,
  nick: row.nick,
  speakerRole: normalizeSpeakerRole(row.speakerRole, row.self),
  speakerNick: row.speakerNick ?? row.nick,
  attributionSource: normalizeAttributionSource(row.attributionSource),
  attributionConfidence: normalizeAttributionConfidence(row.attributionConfidence),
  importBatchId: row.importBatchId,
  body: row.body,
  kind: row.kind as MessageInput['kind'],
  self: Boolean(row.self),
  ts: row.ts,
});

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
