import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile, ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import { parseNetworkInput } from './network-input.js';
import {
  createDuplicateNetworkName,
  getRequiredNetwork,
  getRequiredRuntimeNetwork,
} from './runtime-operation-utils.js';
import { createRuntimeCommandResult, type RuntimeOperationContext } from './runtime-operation-types.js';
import type { NetworkInput } from './storage.js';

export const duplicateNetwork = (context: RuntimeOperationContext, networkId: string) => {
  const network = getRequiredNetwork(context.store, networkId);
  if (isConnectionInstance(network)) {
    throw badRequest('Only saved networks can be duplicated');
  }
  const runtimeProfile = getRequiredRuntimeNetwork(context.store, networkId);
  const duplicate = context.store.upsertNetwork({
    templateId: null,
    managerHidden: false,
    name: createDuplicateNetworkName(network.name, context.store.listNetworks()),
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
};

export const saveNetwork = (context: RuntimeOperationContext, data: unknown, networkId?: string) => {
  const input = parseNetworkInput(data, networkId);
  if (networkId) {
    getRequiredNetwork(context.store, networkId);
  }
  const network = context.store.upsertNetwork(input);
  const updatedProfiles = [network, ...syncTemplateInstances(context, network, input)];
  let serverBuffer = isConnectionInstance(network) ? context.store.getServerBuffer(network.id) : null;
  const messages: ServerMessage[] = [];
  context.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
  for (const updatedProfile of updatedProfiles) {
    if (isConnectionInstance(updatedProfile)) {
      const nextServerBuffer = context.store.getServerBuffer(updatedProfile.id);
      if (nextServerBuffer) {
        messages.push({ type: 'buffer.upsert', buffer: nextServerBuffer });
        if (updatedProfile.id === network.id) {
          serverBuffer = nextServerBuffer;
        }
      }
    }
    messages.push({ type: 'network.upsert', network: updatedProfile });
  }
  return createRuntimeCommandResult({ network, serverBuffer }, messages);
};

export const deleteNetwork = (context: RuntimeOperationContext, networkId: string) => {
  const deletedNetworkIds = context.store
    .listNetworks()
    .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
    .map((candidate) => candidate.id);
  if (deletedNetworkIds.length === 0) {
    throw notFound('Network not found');
  }
  const messages = context.connectionManager.removeNetworks(deletedNetworkIds);
  context.store.deleteNetwork(networkId);
  for (const targetId of deletedNetworkIds) {
    messages.push({ type: 'network.remove', networkId: targetId });
  }
  return createRuntimeCommandResult(deletedNetworkIds, messages);
};

const syncTemplateInstances = (
  context: RuntimeOperationContext,
  profile: NetworkProfile,
  input: NetworkInput,
) => {
  if (isConnectionInstance(profile)) {
    return [];
  }
  return context.store
    .listNetworks()
    .filter((candidate) => isConnectionInstance(candidate) && candidate.templateId === profile.id)
    .map((candidate) => context.store.upsertNetwork({
      id: candidate.id,
      templateId: profile.id,
      managerHidden: true,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      tls: profile.tls,
      nick: profile.nick,
      altNicks: profile.altNicks,
      username: profile.username,
      realName: profile.realName,
      favorite: profile.favorite,
      autoJoin: profile.autoJoin,
      ...(input.password !== undefined ? { password: input.password } : {}),
      ...(input.clearPassword ? { clearPassword: true } : {}),
    }));
};
