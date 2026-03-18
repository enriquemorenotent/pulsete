import { pbkdf2Sync } from 'node:crypto';
import type { ChannelState, NetworkProfile, QueryBuffer } from '../shared/protocol.js';
import type { SecretBox } from './network-secret.js';
import type {
  ChannelRow,
  MessageInput,
  MessageRow,
  NetworkInput,
  NetworkRow,
  QueryRow,
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

export const defaultNetworkTemplates = (username: string): NetworkInput[] => {
  const canonicalUsername = username.trim();
  const ircIdentity = toDefaultIrcIdentity(canonicalUsername);
  const altNicks = [`${ircIdentity}_`, `${ircIdentity}__`];
  return [
    {
      templateId: null,
      managerHidden: false,
      name: 'Libera.Chat',
      host: 'irc.libera.chat',
      port: 6697,
      tls: true,
      nick: ircIdentity,
      altNicks,
      username: ircIdentity,
      realName: canonicalUsername,
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
      nick: ircIdentity,
      altNicks,
      username: ircIdentity,
      realName: canonicalUsername,
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
      nick: ircIdentity,
      altNicks,
      username: ircIdentity,
      realName: canonicalUsername,
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
      nick: ircIdentity,
      altNicks,
      username: ircIdentity,
      realName: canonicalUsername,
      favorite: false,
      autoJoin: [],
    },
  ];
};

const toDefaultIrcIdentity = (username: string) => username.replace(/\s+/g, '_');

export const toNetworkProfile = (row: NetworkRow): NetworkProfile => ({
  id: row.id,
  templateId: row.templateId,
  managerHidden: Boolean(row.managerHidden),
  name: row.name,
  host: row.host,
  port: row.port,
  tls: Boolean(row.tls),
  nick: row.nick,
  altNicks: parseJson<string[]>(row.altNicks, []),
  username: row.username,
  realName: row.realName,
  hasPassword: Boolean(row.password),
  favorite: Boolean(row.favorite),
  autoJoin: parseJson<string[]>(row.autoJoin, []),
});

export const toRuntimeNetworkProfile = (row: NetworkRow, secretBox: SecretBox): RuntimeNetworkProfile => ({
  ...toNetworkProfile(row),
  password: decryptNetworkPassword(row.password, secretBox),
});

export const encryptNetworkPassword = (password: string | undefined, secretBox: SecretBox) =>
  password ? secretBox.encrypt(password) : null;

export const decryptNetworkPassword = (password: string | null, secretBox: SecretBox) =>
  password ? secretBox.decrypt(password) : undefined;

export const toChannelState = (row: ChannelRow): ChannelState => ({
  id: row.id,
  networkId: row.networkId,
  name: row.name,
  topic: row.topic,
  unread: row.unread,
  users: parseJson<string[]>(row.users, []),
});

export const toQueryBuffer = (row: QueryRow): QueryBuffer => ({
  id: row.id,
  networkId: row.networkId,
  target: row.target,
});

export const toMessage = (row: MessageRow): MessageInput => ({
  id: row.id,
  networkId: row.networkId,
  target: row.target,
  nick: row.nick,
  body: row.body,
  kind: row.kind as MessageInput['kind'],
  self: Boolean(row.self),
  ts: row.ts,
});
