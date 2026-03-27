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
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  canClearHistory?: boolean;
  canDownloadHistory?: boolean;
  canImportHistory?: boolean;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  onClearHistory?: () => Promise<boolean>;
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

const resolveOverflowActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer } = context.workspace;
  const overflow: ChatPaneHeaderAction[] = [];

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

  if (context.canClearHistory && context.onClearHistory) {
    overflow.push({
      id: 'clear-history',
      label: 'Clear history',
      tone: 'danger',
      onSelect: () => {
        void context.onClearHistory?.();
      },
    });
  }

  return overflow;
};
