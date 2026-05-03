import type { IrcEventContext, IrcStateContext } from './irc-contexts.js';
import type { RuntimeEvent } from './irc-types.js';
import type { ChannelUserState, PresenceStatus } from '../shared/protocol.js';
import type { MessageInput } from './storage-types.js';
import { snapshotIrcCapabilities } from './irc-capabilities.js';

export const emitEvent = (connection: IrcEventContext, event: RuntimeEvent) => {
  connection.handlers.onEvent(event);
};

export const emitStatus = (
  connection: IrcEventContext,
  message: string,
  kind: 'notice' | 'error' | 'system' = 'system',
  target?: string,
  requireBoundTarget = false
) => {
  emitEvent(connection, {
    type: 'status',
    networkId: connection.profile.id,
    message,
    kind,
    target,
    requireBoundTarget,
  });
};

export const emitSendFailure = (
  connection: IrcEventContext,
  input: {
    sourceTarget: string;
    target: string;
    message: string;
    rollbackMessageId?: string;
  }
) => {
  emitEvent(connection, {
    type: 'send-failed',
    networkId: connection.profile.id,
    sourceTarget: input.sourceTarget,
    target: input.target,
    message: input.message,
    rollbackMessageId: input.rollbackMessageId,
  });
};

export const emitState = (connection: IrcStateContext) => {
  const { lifecycle } = connection;
  emitEvent(connection, {
    type: 'state',
    networkId: connection.profile.id,
    phase: lifecycle.connected ? 'connected' : lifecycle.socket ? 'connecting' : 'offline',
    serverName: lifecycle.serverName,
    nick: lifecycle.currentNick,
    capabilities: snapshotIrcCapabilities(lifecycle.capabilities),
  });
};

export const emitMessage = (connection: IrcStateContext, message: MessageInput) => {
  emitEvent(connection, {
    type: 'message',
    message,
    currentNick: connection.lifecycle.currentNick,
    altNicks: connection.profile.altNicks,
  });
};

export const emitChannelListEntry = (
  connection: IrcEventContext,
  requestId: string,
  entry: { name: string; users: number; topic: string }
) => {
  emitEvent(connection, {
    type: 'channel-list-entry',
    networkId: connection.profile.id,
    requestId,
    entry,
  });
};

export const emitChannelListCompleted = (
  connection: IrcEventContext,
  requestId: string,
  result: { totalEntries: number; truncated: boolean }
) => {
  emitEvent(connection, {
    type: 'channel-list-completed',
    networkId: connection.profile.id,
    requestId,
    totalEntries: result.totalEntries,
    truncated: result.truncated,
  });
};

export const emitChannelListFailed = (connection: IrcEventContext, requestId: string, message: string) => {
  emitEvent(connection, {
    type: 'channel-list-failed',
    networkId: connection.profile.id,
    requestId,
    message,
  });
};

export const emitFriendPresence = (
  connection: IrcEventContext,
  presences: Record<string, PresenceStatus>,
) => {
  emitEvent(connection, {
    type: 'friend-presence',
    networkId: connection.profile.id,
    presences,
  });
};

export const emitChannel = (
  connection: IrcEventContext,
  channel: string,
  details: { topic?: string; users?: ChannelUserState[] } = {}
) => {
  emitEvent(connection, {
    type: 'channel',
    networkId: connection.profile.id,
    channel,
    ...details,
  });
};

export const emitPendingChannel = (connection: IrcEventContext, channel: string) => {
  emitEvent(connection, {
    type: 'channel-pending',
    networkId: connection.profile.id,
    channel,
  });
};

export const emitPendingChannelRemoved = (connection: IrcEventContext, channel: string) => {
  emitEvent(connection, {
    type: 'channel-pending-remove',
    networkId: connection.profile.id,
    channel,
  });
};

export const emitPeerQuit = (
  connection: IrcEventContext,
  input: { nick: string; reason: string; self: boolean },
) => {
  emitEvent(connection, {
    type: 'peer-quit',
    networkId: connection.profile.id,
    nick: input.nick,
    reason: input.reason,
    self: input.self,
  });
};

export const emitPeerNick = (
  connection: IrcEventContext,
  input: { oldNick: string; newNick: string; self: boolean },
) => {
  emitEvent(connection, {
    type: 'peer-nick',
    networkId: connection.profile.id,
    oldNick: input.oldNick,
    newNick: input.newNick,
    self: input.self,
  });
};
