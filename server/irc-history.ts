import { isSameIrcIdentifier } from './irc-parser.js';
import type { IrcCapabilityState, IrcHistoryState } from './irc-state-types.js';

const defaultHistoryLimit = 50;
const historyCapabilityNames = ['draft/chathistory', 'chathistory'];
const historyLimitValueNames = ['isupport/chathistory', 'draft/chathistory', 'chathistory'];

type ChatHistoryConnection = {
  history: IrcHistoryState;
  lifecycle: { capabilities: IrcCapabilityState };
  resolveTrackedChannel(channel: string): string | null;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

type ChatHistoryStateConnection = {
  lifecycle: { capabilities: Pick<IrcCapabilityState, 'values'> };
};

export const hasChatHistoryCapability = (
  capabilities: Pick<IrcCapabilityState, 'negotiated'>,
) => hasChatHistoryName(capabilities.negotiated);

export const shouldRequestBatchCapability = (offered: ReadonlySet<string>, requested: ReadonlySet<string>) =>
  offered.has('batch') && (offered.has('labeled-response') || hasChatHistoryName(requested));

export const requestLatestChatHistory = (connection: ChatHistoryConnection, channel: string) => {
  if (!canRequestLatestChatHistory(connection, channel)) {
    return false;
  }
  const canonicalChannel = connection.resolveTrackedChannel(channel) ?? channel;
  connection.history.pendingTargets.add(canonicalChannel);
  if (connection.sendRaw(`CHATHISTORY LATEST ${canonicalChannel} * ${resolveChatHistoryLimit(connection)}`, canonicalChannel)) {
    return true;
  }
  connection.history.pendingTargets.delete(canonicalChannel);
  return false;
};

export const recordChatHistoryBatchStart = (
  connection: Pick<ChatHistoryConnection, 'history' | 'resolveTrackedChannel'>,
  batchId: string,
  target: string,
) => {
  const canonicalTarget = connection.resolveTrackedChannel(target) ?? target;
  connection.history.batchTargetById.set(batchId, canonicalTarget);
  connection.history.pendingTargets.add(canonicalTarget);
};

export const recordChatHistoryBatchEnd = (connection: Pick<ChatHistoryConnection, 'history'>, batchId: string) => {
  const target = connection.history.batchTargetById.get(batchId) ?? null;
  connection.history.batchTargetById.delete(batchId);
  if (target && !hasActiveHistoryBatchForTarget(connection, target)) {
    connection.history.pendingTargets.delete(target);
  }
};

export const isChatHistoryBatchMessage = (
  connection: Pick<ChatHistoryConnection, 'history'>,
  batchId: string | null | undefined,
) => Boolean(batchId && connection.history.batchTargetById.has(batchId));

export const recordChatHistoryIsupport = (connection: ChatHistoryStateConnection, params: readonly string[]) => {
  for (const token of params.slice(1, -1)) {
    const [name, value] = token.split('=', 2);
    if (name?.toUpperCase() !== 'CHATHISTORY' || value === undefined) {
      continue;
    }
    const previous = connection.lifecycle.capabilities.values.get('isupport/chathistory') ?? null;
    if (previous === value) {
      return false;
    }
    connection.lifecycle.capabilities.values.set('isupport/chathistory', value);
    return true;
  }
  return false;
};

const canRequestLatestChatHistory = (connection: ChatHistoryConnection, channel: string) => {
  if (
    !hasChatHistoryCapability(connection.lifecycle.capabilities)
    || !connection.lifecycle.capabilities.negotiated.has('batch')
  ) {
    return false;
  }
  return !hasPendingHistoryForTarget(connection, channel);
};

const hasPendingHistoryForTarget = (connection: Pick<ChatHistoryConnection, 'history'>, target: string) =>
  Array.from(connection.history.pendingTargets).some((pendingTarget) => isSameIrcIdentifier(pendingTarget, target));

const hasActiveHistoryBatchForTarget = (connection: Pick<ChatHistoryConnection, 'history'>, target: string) =>
  Array.from(connection.history.batchTargetById.values()).some((activeTarget) => isSameIrcIdentifier(activeTarget, target));

const resolveChatHistoryLimit = (connection: ChatHistoryConnection) => {
  for (const name of historyLimitValueNames) {
    const limit = parseHistoryLimit(connection.lifecycle.capabilities.values.get(name));
    if (limit !== null) {
      return Math.min(limit, defaultHistoryLimit);
    }
  }
  return defaultHistoryLimit;
};

const parseHistoryLimit = (value: string | undefined) => {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed === 0 ? defaultHistoryLimit : parsed;
};

const hasChatHistoryName = (capabilities: ReadonlySet<string>) =>
  historyCapabilityNames.some((capability) => capabilities.has(capability));
