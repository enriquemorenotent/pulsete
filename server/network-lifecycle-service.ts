import { isConnectionInstance } from '../shared/network-model.js';
import { collectRequestedServerBuffer, createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
import { listRelatedNetworkIds, syncTemplateInstances } from './network-template-sync.js';
import { badRequest, notFound } from './app-error.js';
import { parseNetworkInput } from './network-input.js';
import { createRuntimeCommandResult, type RuntimeCommandResult, type RuntimeOperationContext } from './runtime-operation-types.js';
import { createDuplicateNetworkName, getRequiredNetwork, getRequiredRuntimeNetwork } from './runtime-operation-utils.js';

type NetworkLifecycleContext = Pick<RuntimeOperationContext, 'connectionManager' | 'store'>;

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
    const network = getRequiredNetwork(this.context.store, networkId);
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = getRequiredRuntimeNetwork(this.context.store, networkId);
    const duplicate = this.context.store.upsertNetwork({
      templateId: null,
      managerHidden: false,
      name: createDuplicateNetworkName(network.name, this.context.store.listNetworks()),
      host: network.host,
      port: network.port,
      tls: network.tls,
      nick: network.nick,
      altNicks: network.altNicks,
      username: network.username,
      realName: network.realName,
      password: runtimeProfile.password,
      favorite: network.favorite,
      autoJoin: network.autoJoin,
    });
    return createRuntimeCommandResult(
      { network: duplicate, serverBuffer: null },
      [{ type: 'network.upsert', network: duplicate }]
    );
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId) {
      getRequiredNetwork(this.context.store, networkId);
    }
    const network = this.context.store.upsertNetwork(input);
    const updatedProfiles = [network, ...syncTemplateInstances(this.context.store, network, input)];
    const serverBuffer = collectRequestedServerBuffer(this.context.store, network.id, updatedProfiles);
    const messages = createNetworkUpsertMessages(this.context.store, updatedProfiles);
    this.context.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
    return createRuntimeCommandResult({ network, serverBuffer }, messages);
  }

  deleteNetwork(networkId: string): RuntimeCommandResult<string[]> {
    const deletedNetworkIds = listRelatedNetworkIds(this.context.store, networkId);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    const messages = this.context.connectionManager.removeNetworks(deletedNetworkIds);
    this.context.store.deleteNetwork(networkId);
    messages.push(...createNetworkRemoveMessages(deletedNetworkIds));
    return createRuntimeCommandResult(deletedNetworkIds, messages);
  }
}
