import type { FriendState } from '../../shared/protocol.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';

export type CommandPaletteEntrySection = 'buffers' | 'friends' | 'actions';

export type CommandPaletteAction =
  | { kind: 'select-network'; networkId: string }
  | { kind: 'select-buffer'; bufferId: string }
  | { kind: 'select-pending-channel'; networkId: string; channel: string }
  | { kind: 'select-friend'; friendId: string }
  | { kind: 'open-preferences' }
  | { kind: 'open-network-manager' }
  | { kind: 'open-channel-list' }
  | { kind: 'toggle-current-channel-autojoin' }
  | { kind: 'clear-buffer-history'; bufferId: string }
  | { kind: 'download-buffer-history'; bufferId: string }
  | { kind: 'open-history-import'; bufferId: string }
  | { kind: 'open-self-aliases'; bufferId: string };

export type CommandPaletteEntrySpec = {
  id: string;
  section: CommandPaletteEntrySection;
  label: string;
  subtitle: string | null;
  keywords: string[];
  badge: string | null;
  action: CommandPaletteAction;
};

export type CommandPaletteEntry = Omit<CommandPaletteEntrySpec, 'action'> & {
  onSelect: () => void | Promise<void>;
};

export type CommandPaletteActionHandlers = {
  selectNetwork: (networkId: string) => void;
  selectBuffer: (bufferId: string) => void;
  selectPendingChannel: (networkId: string, channel: string) => void;
  selectFriend: (friendId: string) => void | Promise<void>;
  openPreferences: () => void;
  openNetworkManager: () => void;
  openChannelList: () => void | Promise<void>;
  toggleCurrentChannelAutoJoin: () => void | Promise<void>;
  clearBufferHistory: (bufferId: string) => void | Promise<void>;
  downloadBufferHistory: (bufferId: string) => void | Promise<void>;
  openHistoryImport: (bufferId: string) => void;
  openSelfAliases: (bufferId: string) => void;
};

type BuildCommandPaletteEntrySpecsInput = {
  connections: SidebarConnectionView[];
  friends: FriendState[];
  selectedBuffer: {
    id: string | null;
    label: string | null;
  };
  selectedNetwork: {
    available: boolean;
    label: string | null;
  };
  actions: {
    canToggleChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
    canClearHistory: boolean;
    canDownloadHistory: boolean;
    canImportHistory: boolean;
    canOpenSelfAliases: boolean;
  };
};

type CommandPaletteHotkeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export const buildCommandPaletteEntrySpecs = (
  input: BuildCommandPaletteEntrySpecsInput,
): CommandPaletteEntrySpec[] => [
  ...buildBufferEntries(input.connections),
  ...buildFriendEntries(input.friends),
  ...buildActionEntries(input),
];

export const filterCommandPaletteEntries = <T extends Pick<CommandPaletteEntrySpec, 'label' | 'subtitle' | 'keywords'>>(
  entries: readonly T[],
  query: string,
): T[] => {
  const normalizedQuery = normalizeCommandPaletteQuery(query);
  if (!normalizedQuery) {
    return [...entries];
  }
  return entries.filter((entry) => getCommandPaletteSearchText(entry).includes(normalizedQuery));
};

export const moveCommandPaletteActiveIndex = (
  currentIndex: number,
  itemCount: number,
  delta: -1 | 1,
) => {
  if (itemCount === 0) {
    return -1;
  }
  if (currentIndex < 0 || currentIndex >= itemCount) {
    return delta > 0 ? 0 : itemCount - 1;
  }
  return (currentIndex + delta + itemCount) % itemCount;
};

export const shouldOpenCommandPaletteFromKeydown = (
  event: CommandPaletteHotkeyEvent,
  input: {
    blockingDialogOpen: boolean;
    paletteOpen: boolean;
  },
) =>
  !event.defaultPrevented
  && !event.isComposing
  && !input.paletteOpen
  && !input.blockingDialogOpen
  && (event.ctrlKey || event.metaKey)
  && !event.altKey
  && !event.shiftKey
  && event.key.toLowerCase() === 'k';

export const runCommandPaletteAction = (
  action: CommandPaletteAction,
  handlers: CommandPaletteActionHandlers,
) => {
  switch (action.kind) {
    case 'select-network':
      return handlers.selectNetwork(action.networkId);
    case 'select-buffer':
      return handlers.selectBuffer(action.bufferId);
    case 'select-pending-channel':
      return handlers.selectPendingChannel(action.networkId, action.channel);
    case 'select-friend':
      return handlers.selectFriend(action.friendId);
    case 'open-preferences':
      return handlers.openPreferences();
    case 'open-network-manager':
      return handlers.openNetworkManager();
    case 'open-channel-list':
      return handlers.openChannelList();
    case 'toggle-current-channel-autojoin':
      return handlers.toggleCurrentChannelAutoJoin();
    case 'clear-buffer-history':
      return handlers.clearBufferHistory(action.bufferId);
    case 'download-buffer-history':
      return handlers.downloadBufferHistory(action.bufferId);
    case 'open-history-import':
      return handlers.openHistoryImport(action.bufferId);
    case 'open-self-aliases':
      return handlers.openSelfAliases(action.bufferId);
  }
};

const buildBufferEntries = (connections: SidebarConnectionView[]): CommandPaletteEntrySpec[] => {
  const entries: CommandPaletteEntrySpec[] = [];
  for (const connection of connections) {
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
          'server',
          'network',
        ],
        badge: 'server',
        action: {
          kind: 'select-network',
          networkId: connection.network.id,
        },
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
        action: {
          kind: 'select-buffer',
          bufferId: child.buffer.id,
        },
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
        ],
        badge: 'pending',
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

const buildFriendEntries = (friends: FriendState[]): CommandPaletteEntrySpec[] =>
  friends.map((friend) => ({
    id: `friend:${friend.id}`,
    section: 'friends',
    label: friend.nick,
    subtitle: 'Saved friend',
    keywords: ['friend', 'private message', 'pm'],
    badge: 'friend',
    action: {
      kind: 'select-friend',
      friendId: friend.id,
    },
  }));

const buildActionEntries = (input: BuildCommandPaletteEntrySpecsInput): CommandPaletteEntrySpec[] => {
  const entries: CommandPaletteEntrySpec[] = [
    {
      id: 'action:open-preferences',
      section: 'actions',
      label: 'Preferences',
      subtitle: 'App settings and assistant account',
      keywords: ['settings', 'preferences', 'assistant'],
      badge: 'action',
      action: { kind: 'open-preferences' },
    },
    {
      id: 'action:open-network-manager',
      section: 'actions',
      label: 'Network Manager',
      subtitle: 'Saved networks and live connection state',
      keywords: ['networks', 'connections', 'server'],
      badge: 'action',
      action: { kind: 'open-network-manager' },
    },
  ];

  if (input.selectedNetwork.available) {
    entries.push({
      id: 'action:open-channel-list',
      section: 'actions',
      label: 'List Channels',
      subtitle: input.selectedNetwork.label ? `Browse channels on ${input.selectedNetwork.label}` : 'Browse channels',
      keywords: ['channels', 'list', 'join'],
      badge: 'action',
      action: { kind: 'open-channel-list' },
    });
  }

  if (input.actions.canToggleChannelAutoJoin) {
    entries.push({
      id: 'action:toggle-current-channel-autojoin',
      section: 'actions',
      label: input.actions.channelAutoJoinActive ? 'Disable Autojoin' : 'Enable Autojoin',
      subtitle: input.selectedBuffer.label ? `For ${input.selectedBuffer.label}` : 'For current channel',
      keywords: ['autojoin', 'channel'],
      badge: 'action',
      action: { kind: 'toggle-current-channel-autojoin' },
    });
  }

  if (input.selectedBuffer.id && input.actions.canClearHistory) {
    entries.push({
      id: 'action:clear-buffer-history',
      section: 'actions',
      label: 'Clear History',
      subtitle: input.selectedBuffer.label ? `For ${input.selectedBuffer.label}` : 'For current buffer',
      keywords: ['clear', 'history', 'messages'],
      badge: 'action',
      action: {
        kind: 'clear-buffer-history',
        bufferId: input.selectedBuffer.id,
      },
    });
  }

  if (input.selectedBuffer.id && input.actions.canDownloadHistory) {
    entries.push({
      id: 'action:download-buffer-history',
      section: 'actions',
      label: 'Download History',
      subtitle: input.selectedBuffer.label ? `For ${input.selectedBuffer.label}` : 'For current buffer',
      keywords: ['download', 'history', 'export'],
      badge: 'action',
      action: {
        kind: 'download-buffer-history',
        bufferId: input.selectedBuffer.id,
      },
    });
  }

  if (input.selectedBuffer.id && input.actions.canImportHistory) {
    entries.push({
      id: 'action:open-history-import',
      section: 'actions',
      label: 'Import Logs',
      subtitle: input.selectedBuffer.label ? `Into ${input.selectedBuffer.label}` : 'Into current buffer',
      keywords: ['import', 'logs', 'history', 'hexchat'],
      badge: 'action',
      action: {
        kind: 'open-history-import',
        bufferId: input.selectedBuffer.id,
      },
    });
  }

  if (input.selectedBuffer.id && input.actions.canOpenSelfAliases) {
    entries.push({
      id: 'action:open-self-aliases',
      section: 'actions',
      label: 'Self Aliases',
      subtitle: input.selectedBuffer.label ? `Repair self history in ${input.selectedBuffer.label}` : 'Repair self history',
      keywords: ['aliases', 'self', 'repair', 'history'],
      badge: 'action',
      action: {
        kind: 'open-self-aliases',
        bufferId: input.selectedBuffer.id,
      },
    });
  }

  return entries;
};

const normalizeCommandPaletteQuery = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const getCommandPaletteSearchText = (
  entry: Pick<CommandPaletteEntrySpec, 'label' | 'subtitle' | 'keywords'>,
) =>
  normalizeCommandPaletteQuery([entry.label, entry.subtitle, ...entry.keywords].filter(Boolean).join(' '));
