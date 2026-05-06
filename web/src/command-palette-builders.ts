import {
  buildCommandPaletteActionEntries,
} from './command-palette-actions.js';
import type {
  BuildCommandPaletteEntrySpecsInput,
  CommandPaletteEntrySpec,
} from './command-palette-types.js';
import {
  buildNickEmojiByNetworkNick,
  resolveNickEmoji,
  resolveUniqueNickEmoji,
} from './nick-emoji-utils.js';

export const buildCommandPaletteEntrySpecs = (input: BuildCommandPaletteEntrySpecsInput) => {
  const nickEmojiByNetworkNick = buildNickEmojiByNetworkNick(input.nickEmojis);
  const bufferEntries = buildBufferEntries(input.connections, input.selectedNetwork.id, nickEmojiByNetworkNick);
  return [
    ...buildUnreadBufferEntries(bufferEntries),
    ...bufferEntries.filter((entry) => !hasUnreadCommandPaletteActivity(entry)),
    ...buildFriendEntries(input.friends, input.nickEmojis),
    ...buildCommandPaletteActionEntries(input),
  ];
};

const buildUnreadBufferEntries = (
  bufferEntries: readonly CommandPaletteEntrySpec[],
): CommandPaletteEntrySpec[] =>
  bufferEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => hasUnreadCommandPaletteActivity(entry))
    .sort((left, right) =>
      compareUnreadCommandPaletteEntries(left.entry, right.entry) || left.index - right.index
    )
    .map(({ entry }) => ({ ...entry, section: 'unread' }));

const hasUnreadCommandPaletteActivity = (entry: CommandPaletteEntrySpec) =>
  entry.ranking.unread > 0 || entry.ranking.priorityUnread > 0;

const compareUnreadCommandPaletteEntries = (
  left: CommandPaletteEntrySpec,
  right: CommandPaletteEntrySpec,
) =>
  Number(right.ranking.priorityUnread > 0) - Number(left.ranking.priorityUnread > 0)
  || right.ranking.priorityUnread - left.ranking.priorityUnread
  || right.ranking.unread - left.ranking.unread
  || Number(right.ranking.currentNetwork) - Number(left.ranking.currentNetwork);

const buildBufferEntries = (
  connections: BuildCommandPaletteEntrySpecsInput['connections'],
  selectedNetworkId: string | null,
  nickEmojiByNetworkNick: ReadonlyMap<string, string>,
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
        keywords: [
          connection.label,
          connection.network.host,
          connection.labelParts.nick,
          'connection',
          'conversation',
          'messages',
          'server',
          'network',
        ],
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
        emoji: child.buffer.kind === 'query'
          ? resolveNickEmoji(nickEmojiByNetworkNick, child.buffer.networkId, child.buffer.target)
          : null,
        subtitle: connection.label,
        keywords: [
          connection.network.name,
          connection.network.host,
          connection.labelParts.nick,
          child.buffer.kind,
          child.buffer.kind === 'query' ? 'private message' : 'channel',
          'conversation',
          'messages',
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
        keywords: [
          connection.network.name,
          connection.network.host,
          connection.labelParts.nick,
          'pending',
          'joining',
          'channel',
          'conversation',
        ],
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
  nickEmojis: BuildCommandPaletteEntrySpecsInput['nickEmojis'],
): CommandPaletteEntrySpec[] =>
  friends.map((friend) => ({
    id: `friend:${friend.id}`,
    section: 'friends',
    label: friend.nick,
    emoji: resolveUniqueNickEmoji(nickEmojis, friend.nick),
    subtitle: 'Watched nick',
    keywords: ['watchlist', 'watched nick', 'private message', 'pm', 'people', 'person', 'contact', 'nick'],
    badge: 'watchlist',
    ranking: {
      currentNetwork: false,
      priorityUnread: 0,
      selected: false,
      unread: 0,
    },
    action: { kind: 'select-friend', friendId: friend.id },
  }));
