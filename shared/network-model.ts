import type { NetworkProfile } from './protocol.js';

export type SavedNetworkProfile = NetworkProfile & {
  managerHidden: false;
  templateId: null;
};

export type ConnectionInstanceProfile = NetworkProfile & {
  managerHidden: true;
  templateId: string;
};

export const isConnectionInstance = (network: NetworkProfile): network is ConnectionInstanceProfile =>
  network.managerHidden;

export const isSavedNetwork = (network: NetworkProfile): network is SavedNetworkProfile =>
  !network.managerHidden && network.templateId === null;

export const getNetworkRootId = (network: Pick<NetworkProfile, 'id' | 'templateId'>) =>
  network.templateId ?? network.id;
