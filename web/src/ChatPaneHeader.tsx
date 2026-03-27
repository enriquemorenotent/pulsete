import type { ReactNode } from 'react';
import type { BufferState, FriendState } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPaneModeLine, shouldShowChatPaneHeaderSubtitle } from './ChatPaneModeLine.js';
import { ChatPaneHeaderActionMenu } from './ChatPaneHeaderActionMenu.js';
import { ChatPaneTopicBar } from './ChatPaneTopicBar.js';
import { resolveChatPaneHeaderActions, type ChatPaneHeaderAction } from './chat-pane-header-actions.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import { findFriendByNick } from './friend-utils.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  onOpenMentionedChannel: (channel: string) => void;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canClearHistory?: boolean;
  onClearHistory?: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  canImportHistory?: boolean;
  onOpenHistoryImport?: () => void;
  onOpenSelfNickAliases?: () => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenChannelList: () => void;
};

export function ChatPaneHeader(props: ChatPaneHeaderProps) {
  const { selectedBuffer } = props.workspace;
  const selectedFriend =
    selectedBuffer?.kind === 'query' ? findFriendByNick(props.friends, selectedBuffer.target) : null;
  const topic = props.workspace.selectedChannel?.topic.trim() ?? '';
  const subtitle = shouldShowChatPaneHeaderSubtitle(props.workspace, props.workspace.headerSubtitle)
    && !resolveChatPaneStatusBanner(props.workspace)
    ? props.workspace.headerSubtitle
    : '';
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
  const actions = resolveChatPaneHeaderActions({
    workspace: props.workspace,
    selectedFriend,
    showChannelAutoJoin: props.showChannelAutoJoin,
    channelAutoJoinActive: props.channelAutoJoinActive,
    canClearHistory: props.canClearHistory,
    canDownloadHistory: props.canDownloadHistory,
    canImportHistory: props.canImportHistory,
    onAddFriend: props.onAddFriend,
    onRemoveFriend: props.onRemoveFriend,
    onToggleChannelAutoJoin: props.onToggleChannelAutoJoin,
    onClearHistory: props.onClearHistory,
    onDownloadHistory: props.onDownloadHistory,
    onOpenHistoryImport: props.onOpenHistoryImport,
    onOpenSelfNickAliases: props.onOpenSelfNickAliases,
    onCloseChannel: props.onCloseChannel,
    onCloseBuffer: props.onCloseBuffer,
    onOpenChannelList: props.onOpenChannelList,
  });

  if (props.workspace.mode === 'server-connected') {
    return (
      <PaneHeader
        title={props.workspace.selectedNetwork?.name ?? 'Server'}
        subtitle={subtitle}
        topicBar={<ChatPaneTopicBar topic={topic} onOpenChannel={props.onOpenMentionedChannel} />}
        modeLine={<ChatPaneModeLine workspace={props.workspace} />}
        actions={<PaneHeaderActions primary={actions.primary} overflow={actions.overflow} />}
      />
    );
  }
  if (isServerBuffer) {
    return null;
  }
  return (
    <PaneHeader
      title={props.workspace.headerTitle}
      subtitle={subtitle}
      topicBar={<ChatPaneTopicBar topic={topic} onOpenChannel={props.onOpenMentionedChannel} />}
      modeLine={<ChatPaneModeLine workspace={props.workspace} />}
      actions={<PaneHeaderActions primary={actions.primary} overflow={actions.overflow} />}
    />
  );
}

function PaneHeaderActions(props: { primary: ChatPaneHeaderAction[]; overflow: ChatPaneHeaderAction[] }) {
  if (props.primary.length === 0 && props.overflow.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {props.primary.map((action) => (
        <Button key={action.id} variant="outline" size="sm" onClick={action.onSelect}>
          {action.label}
        </Button>
      ))}
      <ChatPaneHeaderActionMenu actions={props.overflow} />
    </div>
  );
}

function PaneHeader(props: {
  title: string;
  subtitle: string;
  actions: ReactNode;
  topicBar?: ReactNode;
  modeLine?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-white/6 bg-background/32 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          {props.title ? (
            <h2 className={cn('truncate text-lg font-semibold tracking-tight text-foreground', props.subtitle && 'mb-1')}>
              {props.title}
            </h2>
          ) : null}
          {props.subtitle ? (
            <p className="max-w-xl truncate text-[12px] uppercase tracking-[0.12em] text-muted-foreground">{props.subtitle}</p>
          ) : null}
        </div>
        {props.actions}
      </div>
      {props.topicBar ? props.topicBar : null}
      {props.modeLine ? props.modeLine : null}
    </div>
  );
}
