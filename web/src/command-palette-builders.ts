import {
  buildCommandPaletteActionEntries,
} from './command-palette-actions.js';
import type {
  BuildCommandPaletteEntrySpecsInput,
  CommandPaletteEntrySpec,
} from './command-palette-types.js';

export const buildCommandPaletteEntrySpecs = (
  input: BuildCommandPaletteEntrySpecsInput,
): CommandPaletteEntrySpec[] => [
  ...buildBufferEntries(input.connections, input.selectedNetwork.id),
  ...buildFriendEntries(input.friends),
  ...buildCommandPaletteActionEntries(input),
];

const buildBufferEntries = (
  connections: BuildCommandPaletteEntrySpecsInput['connections'],
  selectedNetworkId: string | null,
): CommandPaletteEntrySpec[] => {
  const entries: CommandPaletteEntrySpec[] = [];
  for (const connection of connections) {
    const currentNetwork = connection.network.id === selectedNetworkId;
    if (connection.serverBuffer) {
      entries.push({
        id: `network:${connection.network.id}`,
        section: 'buffers',
        label: connection.labelParts.name,
        subtitle: `Server buffer · as ${connection.labelParts.nick}`,
        keywords: [connection.label, connection.network.host, connection.labelParts.nick, 'server', 'network'],
        badge: 'server',
        ranking: {
          currentNetwork,
          priorityUnread: connection.serverBuffer.priorityUnread,
          selected: connection.selectedServer,
          unread: connection.serverBuffer.unread,
        },
        action: { kind: 'select-network', networkId: connection.network.id },
      });
    }

    for (const child of connection.childBuffers) {
      const badge = child.buffer.kind === 'channel' ? 'channel' : 'pm';
      entries.push({
        id: `buffer:${child.buffer.id}`,
        section: 'buffers',
        label: child.buffer.target,
        subtitle: connection.label,
        keywords: [
          connection.network.name,
          connection.network.host,
          connection.labelParts.nick,
          child.buffer.kind,
          child.buffer.kind === 'query' ? 'private message' : 'channel',
        ],
        badge,
        ranking: {
          currentNetwork,
          priorityUnread: child.buffer.priorityUnread,
          selected: child.selected,
          unread: child.buffer.unread,
        },
        action: { kind: 'select-buffer', bufferId: child.buffer.id },
      });
    }

    for (const pending of connection.pendingChannels) {
      entries.push({
        id: `pending:${pending.pendingChannel.networkId}:${pending.pendingChannel.channel}`,
        section: 'buffers',
        label: pending.pendingChannel.channel,
        subtitle: `Joining on ${connection.label}`,
        keywords: [connection.network.name, connection.network.host, connection.labelParts.nick, 'pending', 'joining', 'channel'],
        badge: 'pending',
        ranking: {
          currentNetwork,
          priorityUnread: 0,
          selected: pending.selected,
          unread: 0,
        },
        action: {
          kind: 'select-pending-channel',
          networkId: pending.pendingChannel.networkId,
          channel: pending.pendingChannel.channel,
        },
      });
    }
  }
  return entries;
};

const buildFriendEntries = (
  friends: BuildCommandPaletteEntrySpecsInput['friends'],
): CommandPaletteEntrySpec[] =>
  friends.map((friend) => ({
    id: `friend:${friend.id}`,
    section: 'friends',
    label: friend.nick,
    subtitle: 'Saved friend',
    keywords: ['friend', 'private message', 'pm'],
    badge: 'friend',
    ranking: {
      currentNetwork: false,
      priorityUnread: 0,
      selected: false,
      unread: 0,
    },
    action: { kind: 'select-friend', friendId: friend.id },
  }));
