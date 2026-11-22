import type { BufferState } from '../../shared/protocol-chat.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneHeaderAction = {
  icon?: 'close' | 'search-history';
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

  const historyActions = resolveHistoryActions(context);
  const searchIsPrimary = context.workspace.selectedBuffer?.kind === 'query';
  return {
    primary: [
      ...(searchIsPrimary ? historyActions.filter(action => action.id === 'search-history') : []),
      ...resolveCloseActions(context),
    ],
    overflow: searchIsPrimary ? historyActions.filter(action => action.id !== 'search-history') : historyActions,
  };
};

const resolveCloseActions = (context: ResolveChatPaneHeaderActionsContext): ChatPaneHeaderAction[] => {
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

const resolveHistoryActions = (
  context: ResolveChatPaneHeaderActionsContext,
): ChatPaneHeaderAction[] => {
  const { selectedBuffer } = context.workspace;
  const actions: ChatPaneHeaderAction[] = [];

  if (context.canSearchHistory && context.onOpenHistorySearch) {
    actions.push({
      icon: 'search-history',
      id: 'search-history',
      label: 'Search history',
      onSelect: context.onOpenHistorySearch,
    });
  }

  if (context.canDownloadHistory && context.onDownloadHistory) {
    actions.push({
      id: 'download-history',
      label: 'Download history',
      onSelect: () => {
        void context.onDownloadHistory?.();
      },
    });
  }

  if (selectedBuffer?.kind === 'query' && context.canDeleteHistory && context.onDeleteHistory) {
    actions.push({
      id: 'delete-history',
      label: 'Delete history',
      tone: 'danger',
      onSelect: context.onDeleteHistory,
    });
  }

  return actions;
};
