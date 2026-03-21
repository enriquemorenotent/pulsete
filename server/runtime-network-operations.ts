import { NetworkLifecycleService } from './network-lifecycle-service.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

const createNetworkLifecycleService = (context: RuntimeOperationContext) =>
  new NetworkLifecycleService(context);

export const duplicateNetwork = (context: RuntimeOperationContext, networkId: string) =>
  createNetworkLifecycleService(context).duplicateNetwork(networkId);

export const saveNetwork = (context: RuntimeOperationContext, data: unknown, networkId?: string) =>
  createNetworkLifecycleService(context).saveNetwork(data, networkId);

export const deleteNetwork = (context: RuntimeOperationContext, networkId: string) =>
  createNetworkLifecycleService(context).deleteNetwork(networkId);
