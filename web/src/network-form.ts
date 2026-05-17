import type { NetworkAuthMethod, NetworkProfile } from '../../shared/protocol-chat.js';
import {
  defaultNetworkAuthTarget,
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
  username: string;
  nick2: string;
  nick3: string;
  realName: string;
  authMethod: NetworkAuthMethod;
  authTarget: string;
  authAccount: string;
  password: string;
  clearPassword: boolean;
  hasSavedPassword: boolean;
  favorite: boolean;
  autoJoin: string;
  notes: string;
};

export type SaveNetworkPayload = {
  id?: string;
  name: string;
  host: string;
  port: number;
  tls: boolean;
  nick: string;
  username?: string;
  altNicks: string[];
  realName: string;
  authMethod?: NetworkAuthMethod;
  authTarget?: string;
  authAccount?: string;
  password?: string;
  clearPassword?: boolean;
  favorite: boolean;
  autoJoin: string[];
  notes?: string;
};

export const emptyNetworkForm = (): NetworkForm => ({
  name: '',
  host: '',
  port: '6667',
  tls: false,
  nick: '',
  username: '',
  nick2: '',
  nick3: '',
  realName: '',
  authMethod: 'none',
  authTarget: defaultNetworkAuthTarget,
  authAccount: '',
  password: '',
  clearPassword: false,
  hasSavedPassword: false,
  favorite: false,
  autoJoin: '',
  notes: '',
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
  username: network.username ?? '',
  nick2: network.altNicks[0] ?? '',
  nick3: network.altNicks[1] ?? '',
  realName: network.realName,
  authMethod: resolveNetworkAuthMethod(network),
  authTarget: resolveNetworkAuthTarget(network.authTarget),
  authAccount: network.authAccount ?? '',
  password: '',
  clearPassword: false,
  hasSavedPassword: network.hasPassword,
  favorite: network.favorite,
  autoJoin: network.autoJoin.join(', '),
  notes: network.notes ?? '',
});

export const toSaveNetworkPayload = (form: NetworkForm): SaveNetworkPayload => {
  const usesAuthAccount = form.authMethod === 'nickserv' || form.authMethod === 'sasl-plain';
  const password = form.authMethod === 'none' ? '' : form.password;
  const authAccount = usesAuthAccount ? form.authAccount.trim() : '';
  return {
    id: form.id,
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    tls: form.tls,
    nick: form.nick.trim(),
    username: form.username.trim() || undefined,
    altNicks: [form.nick2.trim(), form.nick3.trim()].filter(Boolean),
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
    notes: form.notes,
  };
};
