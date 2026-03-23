import type { NetworkAuthMethod, NetworkProfile } from '../../shared/protocol.js';
import {
  defaultNetworkAuthTarget,
  getNetworkRootId,
  resolveNetworkAuthMethod,
  resolveNetworkAuthTarget,
} from '../../shared/network-model.js';

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
  authMethod: NetworkAuthMethod;
  authTarget: string;
  authAccount: string;
  password: string;
  clearPassword: boolean;
  hasSavedPassword: boolean;
  favorite: boolean;
  autoJoin: string;
};

export type SaveNetworkPayload = {
  id?: string;
  name: string;
  host: string;
  port: number;
  tls: boolean;
  nick: string;
  altNicks: string[];
  username: string;
  realName: string;
  authMethod?: NetworkAuthMethod;
  authTarget?: string;
  authAccount?: string;
  password?: string;
  clearPassword?: boolean;
  favorite: boolean;
  autoJoin: string[];
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
  authMethod: 'none',
  authTarget: defaultNetworkAuthTarget,
  authAccount: '',
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
  authMethod: resolveNetworkAuthMethod(network),
  authTarget: resolveNetworkAuthTarget(network.authTarget),
  authAccount: network.authAccount ?? '',
  password: '',
  clearPassword: false,
  hasSavedPassword: network.hasPassword,
  favorite: network.favorite,
  autoJoin: network.autoJoin.join(', '),
});

export const toSaveNetworkPayload = (form: NetworkForm): SaveNetworkPayload => {
  const usesAuthAccount = form.authMethod === 'nickserv' || form.authMethod === 'sasl-plain';
  const password = form.authMethod === 'none' ? '' : form.password.trim();
  const authAccount = usesAuthAccount ? form.authAccount.trim() : '';
  return {
    id: form.id,
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    tls: form.tls,
    nick: form.nick.trim(),
    altNicks: [form.nick2.trim(), form.nick3.trim()].filter(Boolean),
    username: form.username.trim() || form.nick.trim(),
    realName: form.realName.trim() || form.nick.trim(),
    authMethod: form.authMethod,
    authTarget: form.authMethod === 'nickserv'
      ? resolveNetworkAuthTarget(form.authTarget)
      : undefined,
    authAccount,
    password: password || undefined,
    clearPassword: password ? false : form.clearPassword || undefined,
    favorite: form.favorite,
    autoJoin: parseAutoJoin(form.autoJoin),
  };
};

export const createConnectionInstancePayload = (network: NetworkProfile) => ({
  templateId: getNetworkRootId(network),
  managerHidden: true,
  name: network.name,
  host: network.host,
  port: network.port,
  tls: network.tls,
  nick: network.nick,
  altNicks: network.altNicks,
  username: network.username,
  realName: network.realName,
  authMethod: resolveNetworkAuthMethod(network),
  authTarget: resolveNetworkAuthTarget(network.authTarget),
  authAccount: network.authAccount ?? '',
  favorite: network.favorite,
  autoJoin: network.autoJoin,
});
