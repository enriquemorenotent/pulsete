import type { BufferState, ChannelState, FriendState } from '../../shared/protocol.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneHeaderAction = {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
};

type ResolveChatPaneHeaderActionsContext = {
  workspace: WorkspaceView;
  selectedFriend: FriendState | null;
  selectedQueryMuted?: boolean;
  queryNotificationsEnabled?: boolean;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  canDownloadHistory?: boolean;
  canImportHistory?: boolean;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onMuteSelectedQuery?: () => Promise<boolean>;
  onUnmuteSelectedQuery?: () => Promise<boolean>;
  onToggleQueryNotifications?: () => void;
  onWhoisSelectedQuery?: () => void;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  onDownloadHistory?: () => Promise<boolean>;
  onOpenHistoryImport?: () => void;
  onOpenSelfNickAliases?: () => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenChannelList: () => void;
};

export const resolveChatPaneHeaderActions = (
  context: ResolveChatPaneHeaderActionsContext,
): { primary: ChatPaneHeaderAction[]; overflow: ChatPaneHeaderAction[] } => {
  if (context.workspace.mode === 'server-connected') {
    return {
      primary: [
        {
          id: 'list-channels',
          label: 'List Channels',
          onSelect: context.onOpenChannelList,
        },
      ],
      overflow: [],
    };
  }

  const primary = [
    ...resolvePrimaryActions(
      context.workspace.selectedBuffer,
      context.workspace.selectedChannel,
      context.onCloseChannel,
      context.onCloseBuffer,
    ),
    ...resolveMutedNickPrimaryActions(context),
    ...resolveQueryNotificationPrimaryActions(context),
    ...resolveFriendPrimaryActions(context),
  ];
  const overflow = resolveOverflowActions(context);
  return { primary, overflow };
};

const resolvePrimaryActions = (
  selectedBuffer: BufferState | null,
  selectedChannel: ChannelState | null,
  onCloseChannel: ResolveChatPaneHeaderActionsContext['onCloseChannel'],
  onCloseBuffer: ResolveChatPaneHeaderActionsContext['onCloseBuffer'],
): ChatPaneHeaderAction[] => {
  if (selectedChannel) {
    return [
      {
        id: 'close-channel',
        label: 'Close',
        onSelect: () => onCloseChannel(selectedChannel.networkId, selectedChannel.name),
      },
    ];
  }
  if (selectedBuffer?.kind === 'query') {
    return [
      {
        id: 'close-query',
        label: 'Close',
        onSelect: () => onCloseBuffer(selectedBuffer),
      },
    ];
  }
  return [];
};

const resolveFriendPrimaryActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer } = context.workspace;
  if (selectedBuffer?.kind !== 'query') {
    return [];
  }
  return [
    {
      id: 'friend',
      label: context.selectedFriend ? 'Remove friend' : 'Add friend',
      onSelect: () => {
        void (context.selectedFriend
          ? context.onRemoveFriend(context.selectedFriend.id)
          : context.onAddFriend(selectedBuffer.target));
      },
    },
  ];
};

const resolveQueryNotificationPrimaryActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer } = context.workspace;
  if (selectedBuffer?.kind !== 'query' || context.selectedQueryMuted || !context.onToggleQueryNotifications) {
    return [];
  }
  return [
    {
      id: 'query-notifications',
      label: context.queryNotificationsEnabled
        ? 'Disable Notifications'
        : 'Enable Notifications',
      onSelect: context.onToggleQueryNotifications,
    },
  ];
};

const resolveMutedNickPrimaryActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  if (context.workspace.selectedBuffer?.kind !== 'query') {
    return [];
  }
  if (context.selectedQueryMuted && context.onUnmuteSelectedQuery) {
    return [{
      id: 'unmute-query',
      label: 'Unmute',
      onSelect: () => {
        void context.onUnmuteSelectedQuery?.();
      },
    }];
  }
  if (!context.selectedQueryMuted && context.onMuteSelectedQuery) {
    return [{
      id: 'mute-query',
      label: 'Mute',
      onSelect: () => {
        void context.onMuteSelectedQuery?.();
      },
    }];
  }
  return [];
};

const resolveOverflowActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer } = context.workspace;
  const overflow: ChatPaneHeaderAction[] = [];

  if (selectedBuffer?.kind === 'query' && context.onWhoisSelectedQuery) {
    overflow.push({
      id: 'query-whois',
      label: 'WHOIS',
      onSelect: context.onWhoisSelectedQuery,
    });
  }

  if (context.showChannelAutoJoin) {
    overflow.push({
      id: 'autojoin',
      label: context.channelAutoJoinActive ? 'Autojoin On' : 'Autojoin Off',
      onSelect: () => {
        void context.onToggleChannelAutoJoin();
      },
    });
  }

  if (context.canDownloadHistory && context.onDownloadHistory) {
    overflow.push({
      id: 'download-history',
      label: 'Download history',
      onSelect: () => {
        void context.onDownloadHistory?.();
      },
    });
  }

  if (context.canImportHistory && context.onOpenHistoryImport) {
    overflow.push({
      id: 'import-history',
      label: 'Import logs',
      onSelect: context.onOpenHistoryImport,
    });
  }

  if ((selectedBuffer?.kind === 'channel' || selectedBuffer?.kind === 'query') && context.onOpenSelfNickAliases) {
    overflow.push({
      id: 'self-aliases',
      label: 'Self aliases',
      onSelect: context.onOpenSelfNickAliases,
    });
  }

  return overflow;
};
