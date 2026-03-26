import { pbkdf2Sync } from 'node:crypto';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SpeakerAttributionConfidence, SpeakerAttributionSource, SpeakerRole } from '../shared/protocol.js';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import type { BufferState, ChannelState, ChannelUserState, FriendState } from '../shared/protocol.js';
import { parseChannelUser, sortChannelUsers } from '../shared/channel-users.js';
import { getLocalIrcIdentity } from '../shared/local-defaults.js';
import type { SecretBox } from './network-secret.js';
import type {
  BufferRow,
  ChannelRow,
  FriendRow,
  MessageInput,
  MessageRow,
  NetworkInput,
  NetworkRow,
  RuntimeNetworkProfile,
} from './storage-types.js';

export const hashPassword = (password: string, salt: string) =>
  pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');

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

export const toNetworkProfile = (row: NetworkRow): StoredNetworkProfile => {
  const profile = {
    id: row.id,
    templateId: row.templateId,
    managerHidden: Boolean(row.managerHidden),
    name: row.name,
    host: row.host,
    port: row.port,
    tls: Boolean(row.tls),
    nick: row.nick,
    altNicks: parseJson<string[]>(row.altNicks, []),
    historicalSelfNicks: parseJson<string[]>(row.historicalSelfNicks, []),
    username: row.username,
    realName: row.realName,
    hasPassword: Boolean(row.password),
    authMethod: row.authMethod,
    authTarget: row.authTarget,
    authAccount: row.authAccount,
    favorite: Boolean(row.favorite),
    autoJoin: parseJson<string[]>(row.autoJoin, []),
  };
  return profile.managerHidden
    ? profile as Extract<StoredNetworkProfile, { managerHidden: true }>
    : profile as Extract<StoredNetworkProfile, { managerHidden: false }>;
};

export const toRuntimeNetworkProfile = (row: NetworkRow, secretBox: SecretBox): RuntimeNetworkProfile => ({
  ...toNetworkProfile(row),
  password: decryptNetworkPassword(row.password, secretBox),
});

export const encryptNetworkPassword = (password: string | undefined, secretBox: SecretBox) =>
  password ? secretBox.encrypt(password) : null;

export const decryptNetworkPassword = (password: string | null, secretBox: SecretBox) =>
  password ? secretBox.decrypt(password) : undefined;

export const toBufferState = (row: BufferRow): BufferState => ({
  id: row.id,
  networkId: row.networkId,
  unread: row.unread,
  priorityUnread: row.priorityUnread,
  lastReadTs: row.lastReadTs,
  lastReadMessageId: row.lastReadMessageId,
  kind: row.kind,
  target: row.target,
  selfNickAliases: parseJson<string[]>(row.selfNickAliases, []),
});

export const toFriendState = (row: FriendRow): FriendState => ({
  id: row.id,
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
  body: normalizeMessageBody(row),
  kind: normalizeMessageKind(row),
  self: Boolean(row.self),
  ts: row.ts,
});

const normalizeMessageKind = (row: MessageRow): MessageInput['kind'] =>
  isLegacyActionRow(row) ? 'action' : row.kind as MessageInput['kind'];

const normalizeMessageBody = (row: MessageRow) => {
  const match = getLegacyActionMatch(row);
  return match ? match[2] : row.body;
};

const isLegacyActionRow = (row: MessageRow) =>
  row.kind === 'line' && getLegacyActionMatch(row) !== null;

const getLegacyActionMatch = (row: MessageRow) => {
  if (row.kind !== 'line' || !row.nick) {
    return null;
  }
  const match = /^\*\s+(\S+)\s+([\s\S]+)$/.exec(row.body);
  if (!match) {
    return null;
  }
  return isSameIrcIdentifier(match[1], row.nick) ? match : null;
};

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
    || value === 'legacy-backfill'
    || value === 'unknown'
    ? value
    : 'unknown';

const normalizeAttributionConfidence = (value: string | null): SpeakerAttributionConfidence =>
  value === 'high' || value === 'low' ? value : 'low';
