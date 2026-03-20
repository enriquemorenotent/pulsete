import type { MessageInput } from './storage.js';
import type { IrcConnectionState, RuntimeEvent } from './irc-types.js';
import type { ChannelUserState } from '../shared/protocol.js';

export const emitEvent = (connection: IrcConnectionState, event: RuntimeEvent) => {
  connection.handlers.onEvent(event);
};

export const emitStatus = (
  connection: IrcConnectionState,
  message: string,
  kind: 'notice' | 'error' | 'system' = 'system',
  target?: string,
  requireBoundTarget = false,
  failedChannelJoinTarget?: string,
  failedChannelJoinBufferId?: string
) => {
  emitEvent(connection, {
    type: 'status',
    networkId: connection.profile.id,
    message,
    kind,
    target,
    requireBoundTarget,
    failedChannelJoinTarget,
    failedChannelJoinBufferId,
  });
};

export const emitState = (connection: IrcConnectionState) => {
  emitEvent(connection, {
    type: 'state',
    networkId: connection.profile.id,
    connected: connection.connected,
    serverName: connection.serverName,
    nick: connection.currentNick,
  });
};

export const emitMessage = (connection: IrcConnectionState, message: MessageInput) => {
  emitEvent(connection, { type: 'message', message });
};

export const emitChannelListStarted = (connection: IrcConnectionState, requestId: string) => {
  emitEvent(connection, {
    type: 'channel-list-started',
    networkId: connection.profile.id,
    requestId,
  });
};

export const emitChannelListEntry = (
  connection: IrcConnectionState,
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

export const emitChannelListCompleted = (connection: IrcConnectionState, requestId: string) => {
  emitEvent(connection, {
    type: 'channel-list-completed',
    networkId: connection.profile.id,
    requestId,
  });
};

export const emitChannelListFailed = (connection: IrcConnectionState, requestId: string, message: string) => {
  emitEvent(connection, {
    type: 'channel-list-failed',
    networkId: connection.profile.id,
    requestId,
    message,
  });
};

export const emitFriendPresence = (connection: IrcConnectionState, onlineNicks: string[]) => {
  emitEvent(connection, {
    type: 'friend-presence',
    networkId: connection.profile.id,
    onlineNicks,
  });
};

export const emitChannel = (
  connection: IrcConnectionState,
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
