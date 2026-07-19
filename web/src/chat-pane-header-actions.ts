import type { BufferState } from '../../shared/protocol-chat.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneHeaderAction = {
  icon?: 'close' | 'whois';
  id: string;
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
};

type ResolveChatPaneHeaderActionsContext = {
  workspace: WorkspaceView;
  canDownloadHistory?: boolean;
  canDeleteHistory?: boolean;
  canSearchHistory?: boolean;
  onWhoisSelectedQuery?: () => void;
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

  const primary = resolvePrimaryActions(context);
  const overflow = resolveOverflowActions(context);
  return { primary, overflow };
};

const resolvePrimaryActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer, selectedChannel } = context.workspace;
  if (selectedChannel) {
    return [
      {
        icon: 'close',
        id: 'close-channel',
        label: 'Close',
        onSelect: () => context.onCloseChannel(selectedChannel.networkId, selectedChannel.name),
      },
    ];
  }
  if (selectedBuffer?.kind === 'query') {
    return [
      ...(context.onWhoisSelectedQuery ? [{
        icon: 'whois' as const,
        id: 'query-whois',
        label: 'WHOIS',
        onSelect: context.onWhoisSelectedQuery,
      }] : []),
      {
        icon: 'close',
        id: 'close-query',
        label: 'Close',
        onSelect: () => context.onCloseBuffer(selectedBuffer),
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
