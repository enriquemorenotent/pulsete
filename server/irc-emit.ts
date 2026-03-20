import type { MessageInput } from './storage.js';
import type { IrcConnectionState, RuntimeEvent } from './irc-types.js';

export const emitEvent = (connection: IrcConnectionState, event: RuntimeEvent) => {
  connection.handlers.onEvent(event);
};

export const emitStatus = (
  connection: IrcConnectionState,
  message: string,
  kind: 'notice' | 'error' | 'system' = 'system',
  target?: string
) => {
  emitEvent(connection, {
    type: 'status',
    networkId: connection.profile.id,
    message,
    kind,
    target,
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

export const emitChannel = (
  connection: IrcConnectionState,
  channel: string,
  details: { topic?: string; users?: string[] } = {}
) => {
  emitEvent(connection, {
    type: 'channel',
    networkId: connection.profile.id,
    channel,
    ...details,
  });
};
