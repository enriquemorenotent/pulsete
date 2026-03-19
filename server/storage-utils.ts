import { pbkdf2Sync } from 'node:crypto';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { getLocalIrcIdentity } from '../shared/local-defaults.js';
import type { SecretBox } from './network-secret.js';
import type {
  BufferRow,
  ChannelRow,
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
      username: identity.username,
      realName: identity.realName,
      favorite: false,
      autoJoin: [],
    },
  ];
};

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

export const toBufferState = (row: BufferRow): BufferState => ({
  id: row.id,
  networkId: row.networkId,
  unread: row.unread,
  kind: row.kind,
  target: row.target,
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
  users: parseJson<string[]>(row.users, []),
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
