import type { NetworkProfile } from '../../shared/protocol.js';

export type EditorTab = 'servers' | 'autojoin';

export type NetworkForm = {
  id?: string;
  name: string;
  host: string;
  port: string;
  tls: boolean;
  nick: string;
  nick2: string;
  nick3: string;
  username: string;
  realName: string;
  password: string;
  clearPassword: boolean;
  hasSavedPassword: boolean;
  favorite: boolean;
  autoJoin: string;
};

export const emptyNetworkForm = (): NetworkForm => ({
  name: '',
  host: '',
  port: '6667',
  tls: false,
  nick: '',
  nick2: '',
  nick3: '',
  username: '',
  realName: '',
  password: '',
  clearPassword: false,
  hasSavedPassword: false,
  favorite: false,
  autoJoin: '',
});

export const parseAutoJoin = (text: string) =>
  text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const toForm = (network: NetworkProfile): NetworkForm => ({
  id: network.id,
  name: network.name,
  host: network.host,
  port: String(network.port),
  tls: network.tls,
  nick: network.nick,
  nick2: network.altNicks[0] ?? '',
  nick3: network.altNicks[1] ?? '',
  username: network.username,
  realName: network.realName,
  password: '',
  clearPassword: false,
  hasSavedPassword: network.hasPassword,
  favorite: network.favorite,
  autoJoin: network.autoJoin.join(', '),
});

export const getTemplateRootId = (network: NetworkProfile) => network.templateId ?? network.id;

export const createConnectionInstancePayload = (network: NetworkProfile) => ({
  templateId: getTemplateRootId(network),
  managerHidden: true,
  name: network.name,
  host: network.host,
  port: network.port,
  tls: network.tls,
  nick: network.nick,
  altNicks: network.altNicks,
  username: network.username,
  realName: network.realName,
  favorite: network.favorite,
  autoJoin: network.autoJoin,
});
