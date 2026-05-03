import { listSavedNetworks } from '../shared/network-model.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';

export const createDuplicateNetworkName = (name: string, networks: NetworkProfile[]) => {
  const existingNames = new Set(
    listSavedNetworks(networks)
      .map((network) => network.name.toLowerCase())
  );
  const baseName = `${name} copy`;
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};
