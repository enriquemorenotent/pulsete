import type { NetworkProfile } from '../shared/protocol.js';
import { notFound } from './app-error.js';
import { Storage } from './storage.js';

export const getRequiredRuntimeNetwork = (store: Storage, networkId: string) => {
  const profile = store.getRuntimeNetwork(networkId);
  if (!profile) {
    throw notFound('Network not found');
  }
  return profile;
};

export const getRequiredNetwork = (store: Storage, networkId: string) => {
  const profile = store.getNetwork(networkId);
  if (!profile) {
    throw notFound('Network not found');
  }
  return profile;
};

export const getRequiredBuffer = (store: Storage, bufferId: string) => {
  const buffer = store.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  return buffer;
};

export const resolveReplyTarget = (store: Storage, networkId: string, sourceBufferId?: string, fallbackTarget = 'server') => {
  if (!sourceBufferId) {
    return fallbackTarget;
  }
  const buffer = store.getBuffer(sourceBufferId);
  return buffer?.networkId === networkId ? buffer.target : fallbackTarget;
};

export const createDuplicateNetworkName = (name: string, networks: NetworkProfile[]) => {
  const existingNames = new Set(
    networks
      .filter((network) => !network.managerHidden)
      .map((network) => network.name.toLocaleLowerCase())
  );
  const baseName = `${name} copy`;
  if (!existingNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};
