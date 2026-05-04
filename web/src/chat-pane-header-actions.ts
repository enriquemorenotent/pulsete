import type { BufferState, ChannelState } from '../../shared/protocol-chat.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneHeaderAction = {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
};

type ResolveChatPaneHeaderActionsContext = {
  workspace: WorkspaceView;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  canDownloadHistory?: boolean;
  canDeleteHistory?: boolean;
  canSearchHistory?: boolean;
  onWhoisSelectedQuery?: () => void;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  onDownloadHistory?: () => Promise<boolean>;
  onDeleteHistory?: () => void;
  onOpenHistorySearch?: () => void;
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

  if (context.canSearchHistory && context.onOpenHistorySearch) {
    overflow.push({
      id: 'search-history',
      label: 'Search history',
      onSelect: context.onOpenHistorySearch,
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

  if (selectedBuffer?.kind === 'query' && context.canDeleteHistory && context.onDeleteHistory) {
    overflow.push({
      id: 'delete-history',
      label: 'Delete history',
      tone: 'danger',
      onSelect: context.onDeleteHistory,
    });
  }

  return overflow;
};
