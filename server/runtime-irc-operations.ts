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
import { createRuntimeCommandResult, type RuntimeOperationContext } from './runtime-operation-types.js';

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
  context.connectionManager.getSession(networkId).command.join(
    normalizedChannel,
    resolveReplyTarget(context.store, networkId, sourceBufferId),
    { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
  );
  return createRuntimeCommandResult(undefined);
};

export const part = (
  context: RuntimeOperationContext,
  networkId: string,
  channel: string,
  sourceBufferId?: string,
) => {
  getRequiredNetwork(context.store, networkId);
  const normalizedChannel = normalizeChannelTarget(channel);
  context.connectionManager.getSession(networkId).command.part(
    normalizedChannel,
    'Leaving',
    resolveReplyTarget(context.store, networkId, sourceBufferId, normalizedChannel)
  );
  return createRuntimeCommandResult(undefined);
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
  const session = context.connectionManager.getSession(networkId);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId, normalizedTarget);
  kind === 'action'
    ? session.command.action(normalizedTarget, normalizedBody, replyTarget)
    : session.command.say(normalizedTarget, normalizedBody, replyTarget);
  return createRuntimeCommandResult(undefined);
};

export const sendRaw = (
  context: RuntimeOperationContext,
  networkId: string,
  raw: string,
  sourceBufferId?: string,
) => {
  const normalizedRaw = normalizeRawCommand(raw);
  const session = context.connectionManager.getSession(networkId);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId);
  if (/^\s*NICK\s+/i.test(normalizedRaw)) {
    const nextNick = normalizedRaw.trim().split(/\s+/)[1];
    if (nextNick) {
      session.socket
        ? session.command.setNick(nextNick, replyTarget)
        : session.transport.sendRaw(normalizedRaw, replyTarget);
      return createRuntimeCommandResult(undefined);
    }
  }
  if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
    session.socket
      ? session.lifecycle.disconnect(normalizedRaw.trim())
      : session.transport.sendRaw(normalizedRaw, replyTarget);
    return createRuntimeCommandResult(undefined);
  }
  session.transport.sendClientRaw(normalizedRaw, replyTarget);
  return createRuntimeCommandResult(undefined);
};

export const requestChannelList = (
  context: RuntimeOperationContext,
  networkId: string,
  requester?: WebSocket,
) => {
  getRequiredNetwork(context.store, networkId);
  return createRuntimeCommandResult(context.connectionManager.requestChannelList(networkId, requester));
};
