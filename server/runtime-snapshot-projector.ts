import {
  emptyNetworkRuntimeCapabilities,
  type FriendState,
  type NetworkProfile,
  type NetworkRuntimeState,
} from '../shared/protocol.js';
import type { IrcConnection } from './irc.js';
import type { RuntimeFriendPresenceProjector } from './runtime-friend-presence-projector.js';
import type { BufferState } from '../shared/protocol.js';

export const createRuntimeProjectionSnapshot = (
  networks: NetworkProfile[],
  friends: FriendState[],
  buffers: BufferState[],
  connections: readonly IrcConnection[],
  friendPresence: RuntimeFriendPresenceProjector
) => ({
  pendingChannels: connections.flatMap((connection) => connection.listPendingChannels()),
  friendPresence: friendPresence.snapshot(friends),
  queryPresence: friendPresence.snapshotQueries(buffers),
  networkStates: Object.fromEntries(
    networks.map((network) => {
      const connection = connections.find((candidate) => candidate.profile.id === network.id);
      return [network.id, toNetworkRuntimeState(connection, network.nick)];
    })
  ),
});

const toNetworkRuntimeState = (
  connection: IrcConnection | undefined,
  fallbackNick: string
): NetworkRuntimeState =>
  connection
    ? connection.state
    : {
        phase: 'offline',
        serverName: null,
        nick: fallbackNick,
        capabilities: emptyNetworkRuntimeCapabilities(),
      };
