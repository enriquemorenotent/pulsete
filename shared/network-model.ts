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

export type SavedNetworkProfile = NetworkProfile & {
  managerHidden: false;
  templateId: null;
};

export type ConnectionInstanceProfile = NetworkProfile & {
  managerHidden: true;
  templateId: string;
};

export type StoredNetworkProfile = SavedNetworkProfile | ConnectionInstanceProfile;

export const isConnectionInstance = (network: NetworkProfile): network is ConnectionInstanceProfile =>
  network.managerHidden;

export const isSavedNetwork = (network: NetworkProfile): network is SavedNetworkProfile =>
  !network.managerHidden && network.templateId === null;

export const getNetworkRootId = (network: Pick<NetworkProfile, 'id' | 'templateId'>) =>
  network.templateId ?? network.id;

export const listSavedNetworks = (networks: readonly NetworkProfile[]) =>
  networks.filter(isSavedNetwork);

export const listConnectionInstances = (networks: readonly NetworkProfile[]) =>
  networks.filter(isConnectionInstance);

export const listConnectionPeers = (
  networks: readonly NetworkProfile[],
  rootId: string
) => listConnectionInstances(networks).filter((network) => getNetworkRootId(network) === rootId);
