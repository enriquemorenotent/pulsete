import { listSavedNetworks } from '../shared/network-model.js';
import type { NetworkProfile } from '../shared/protocol.js';

export const createDuplicateNetworkName = (name: string, networks: NetworkProfile[]) => {
  const existingNames = new Set(
    listSavedNetworks(networks)
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
