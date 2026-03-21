import type WebSocket from 'ws';
import {
  normalizeChannelTarget,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import {
  getRequiredNetwork,
  resolveReplyTarget,
} from './runtime-operation-utils.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

export const join = (
  context: RuntimeOperationContext,
  networkId: string,
  channel: string,
  sourceBufferId?: string,
) => {
  getRequiredNetwork(context.store, networkId);
  const normalizedChannel = normalizeChannelTarget(channel);
  const existingBuffer = context.store.getBufferByTarget(networkId, normalizedChannel);
  const existingChannel = context.store.getChannelByName(networkId, normalizedChannel);
  context.connectionManager.getConnection(networkId).join(
    normalizedChannel,
    resolveReplyTarget(context.store, networkId, sourceBufferId),
    { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
  );
};

export const part = (
  context: RuntimeOperationContext,
  networkId: string,
  channel: string,
  sourceBufferId?: string,
) => {
  getRequiredNetwork(context.store, networkId);
  const normalizedChannel = normalizeChannelTarget(channel);
  context.connectionManager.getConnection(networkId).part(
    normalizedChannel,
    'Leaving',
    resolveReplyTarget(context.store, networkId, sourceBufferId, normalizedChannel)
  );
};

export const sendMessage = (
  context: RuntimeOperationContext,
  networkId: string,
  target: string,
  body: string,
  kind: 'message' | 'action' = 'message',
  sourceBufferId?: string,
) => {
  const normalizedTarget = normalizeMessageTarget(target);
  const normalizedBody = normalizeMessageBody(body);
  const connection = context.connectionManager.getConnection(networkId);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId, normalizedTarget);
  kind === 'action'
    ? connection.action(normalizedTarget, normalizedBody, replyTarget)
    : connection.say(normalizedTarget, normalizedBody, replyTarget);
};

export const sendRaw = (
  context: RuntimeOperationContext,
  networkId: string,
  raw: string,
  sourceBufferId?: string,
) => {
  const normalizedRaw = normalizeRawCommand(raw);
  const connection = context.connectionManager.getConnection(networkId);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId);
  if (/^\s*NICK\s+/i.test(normalizedRaw)) {
    const nextNick = normalizedRaw.trim().split(/\s+/)[1];
    if (nextNick) {
      connection.socket ? connection.setNick(nextNick, replyTarget) : connection.sendRaw(normalizedRaw, replyTarget);
      return;
    }
  }
  if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
    connection.socket ? connection.disconnect(normalizedRaw.trim()) : connection.sendRaw(normalizedRaw, replyTarget);
    return;
  }
  connection.sendClientRaw(normalizedRaw, replyTarget);
};

export const requestChannelList = (
  context: RuntimeOperationContext,
  networkId: string,
  requester?: WebSocket,
) => {
  getRequiredNetwork(context.store, networkId);
  return context.connectionManager.requestChannelList(networkId, requester);
};

