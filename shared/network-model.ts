import type { NetworkAuthMethod, NetworkProfile } from './protocol.js';

export const defaultNetworkAuthTarget = 'NickServ';

type NetworkAuthConfig = {
  authMethod?: NetworkAuthMethod;
  authTarget?: string | null;
  authAccount?: string | null;
  nick?: string | null;
  hasPassword?: boolean;
  password?: string;
};

export const defaultNetworkAuthMethod = (hasSecret = false): NetworkAuthMethod =>
  hasSecret ? 'server-pass' : 'none';

export const resolveNetworkAuthMethod = (network: NetworkAuthConfig): NetworkAuthMethod => {
  if (network.authMethod) {
    return network.authMethod;
  }
  const hasSecret = Boolean(network.password) || network.hasPassword === true;
  return defaultNetworkAuthMethod(hasSecret);
};

export const resolveNetworkAuthTarget = (authTarget?: string | null) =>
  authTarget?.trim() || defaultNetworkAuthTarget;

export const resolveNetworkAuthAccount = (network: Pick<NetworkAuthConfig, 'authAccount' | 'nick'>) =>
  network.authAccount?.trim() || network.nick?.trim() || '';

export type StoredNetworkProfile = NetworkProfile;

export const listSavedNetworks = (networks: readonly NetworkProfile[]) =>
  [...networks];

export const listWorkspaceNetworks = (networks: readonly NetworkProfile[]) =>
  networks.filter((network) => network.workspaceOpen);
