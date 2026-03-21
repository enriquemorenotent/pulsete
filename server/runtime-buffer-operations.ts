import { normalizeQueryTarget } from './irc-validate.js';
import { getRequiredNetwork } from './runtime-operation-utils.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

export const openQuery = (context: RuntimeOperationContext, networkId: string, target: string) => {
  getRequiredNetwork(context.store, networkId);
  return context.conversations.openQuery(networkId, normalizeQueryTarget(target));
};

export const closeBuffer = (context: RuntimeOperationContext, bufferId: string) =>
  context.conversations.closeQueryBuffer(bufferId);

export const markBufferRead = (context: RuntimeOperationContext, bufferId: string) =>
  context.conversations.markBufferRead(bufferId);

export const history = (context: RuntimeOperationContext, bufferId: string, limit: number) =>
  context.conversations.listBufferHistory(bufferId, limit);
