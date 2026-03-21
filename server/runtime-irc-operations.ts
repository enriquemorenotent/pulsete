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

type CommandApi = {
  action(target: string, text: string, sourceTarget?: string): void;
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean;
  part(channel: string, reason?: string, sourceTarget?: string): boolean;
  say(target: string, text: string, sourceTarget?: string): void;
  setNick(nick: string, sourceTarget?: string): boolean;
};

type LifecycleApi = {
  disconnect(raw?: string): void;
};

type TransportApi = {
  sendClientRaw(raw: string, sourceTarget?: string): boolean;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

type RuntimeIrcConnection = CommandApi & LifecycleApi & TransportApi & {
  socket?: unknown;
  commandController?: CommandApi;
  lifecycleController?: LifecycleApi;
  transportController?: TransportApi;
};

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
  getCommandApi(context.connectionManager.getConnection(networkId)).join(
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
  getCommandApi(context.connectionManager.getConnection(networkId)).part(
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
  const connection = context.connectionManager.getConnection(networkId);
  const commandApi = getCommandApi(connection);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId, normalizedTarget);
  kind === 'action'
    ? commandApi.action(normalizedTarget, normalizedBody, replyTarget)
    : commandApi.say(normalizedTarget, normalizedBody, replyTarget);
  return createRuntimeCommandResult(undefined);
};

export const sendRaw = (
  context: RuntimeOperationContext,
  networkId: string,
  raw: string,
  sourceBufferId?: string,
) => {
  const normalizedRaw = normalizeRawCommand(raw);
  const connection = context.connectionManager.getConnection(networkId) as RuntimeIrcConnection;
  const commandApi = getCommandApi(connection);
  const lifecycleApi = getLifecycleApi(connection);
  const transportApi = getTransportApi(connection);
  const replyTarget = resolveReplyTarget(context.store, networkId, sourceBufferId);
  if (/^\s*NICK\s+/i.test(normalizedRaw)) {
    const nextNick = normalizedRaw.trim().split(/\s+/)[1];
    if (nextNick) {
      connection.socket
        ? commandApi.setNick(nextNick, replyTarget)
        : transportApi.sendRaw(normalizedRaw, replyTarget);
      return createRuntimeCommandResult(undefined);
    }
  }
  if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
    connection.socket
      ? lifecycleApi.disconnect(normalizedRaw.trim())
      : transportApi.sendRaw(normalizedRaw, replyTarget);
    return createRuntimeCommandResult(undefined);
  }
  transportApi.sendClientRaw(normalizedRaw, replyTarget);
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

const getCommandApi = (connection: RuntimeIrcConnection): CommandApi =>
  connection.commandController ?? connection;

const getLifecycleApi = (connection: RuntimeIrcConnection): LifecycleApi =>
  connection.lifecycleController ?? connection;

const getTransportApi = (connection: RuntimeIrcConnection): TransportApi =>
  connection.transportController ?? connection;
