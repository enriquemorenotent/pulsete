import {
  createIrcChannelListPort,
  createIrcChannelPort,
  createIrcCommandPort,
  createIrcFriendPresencePort,
  createIrcLifecyclePort,
  createIrcReplyPort,
  createIrcTransportPort,
} from './irc-ports.js';
import { defineIrcConnectionApi, type IrcConnectionApi } from './irc-connection-compat.js';
import { createIrcConnectionAccess, type IrcConnectionOptions } from './irc-connection-state.js';
import type { Handlers, IrcConnectionState } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const createConnectionState = (
  profile: RuntimeNetworkProfile,
  handlers: Handlers,
  options: IrcConnectionOptions = {}
): IrcConnection => {
  const { connection, setPorts } = createIrcConnectionAccess(profile, handlers, options);

  const lifecyclePort = createIrcLifecyclePort(connection);
  const commandPort = createIrcCommandPort(connection);
  const friendPresencePort = createIrcFriendPresencePort(connection);
  const replyPort = createIrcReplyPort(connection);
  const transportPort = createIrcTransportPort(connection);
  const channelListPort = createIrcChannelListPort(connection);
  const channelPort = createIrcChannelPort(connection);
  const ports = {
    lifecycle: lifecyclePort,
    command: commandPort,
    friendPresence: friendPresencePort,
    reply: replyPort,
    transport: transportPort,
    channelList: channelListPort,
    channels: channelPort,
  };
  setPorts(ports);
  defineIrcConnectionApi(connection);

  return connection as IrcConnection;
};

export interface IrcConnection extends IrcConnectionState, IrcConnectionApi {}

export class IrcConnection {
  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    return createConnectionState(profile, handlers, options);
  }
}
