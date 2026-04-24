import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { BufferState, FriendState } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPaneHeaderActionMenu } from './ChatPaneHeaderActionMenu.js';
import { ChatPaneTopicBar } from './ChatPaneTopicBar.js';
import { ContactSettingsDialog } from './ContactSettingsDialog.js';
import { resolveChatPaneHeaderActions, type ChatPaneHeaderAction } from './chat-pane-header-actions.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import { findFriendByNick } from './friend-utils.js';
import { QueryContactControls } from './QueryContactControls.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  selectedQueryMuted?: boolean;
  queryNotificationsEnabled?: boolean;
  onOpenMentionedChannel: (channel: string) => void;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onMuteSelectedQuery?: () => Promise<boolean>;
  onUnmuteSelectedQuery?: () => Promise<boolean>;
  onToggleQueryNotifications?: () => void;
  onWhoisSelectedQuery?: () => void;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenChannelList: () => void;
};

export function ChatPaneHeader(props: ChatPaneHeaderProps) {
  const [contactSettingsOpen, setContactSettingsOpen] = useState(false);
  const { selectedBuffer } = props.workspace;
  const selectedFriend =
    selectedBuffer?.kind === 'query' ? findFriendByNick(props.friends, selectedBuffer.target) : null;
  const selectedQuery =
    selectedBuffer?.kind === 'query' && props.workspace.selectedNetwork
      ? {
          network: props.workspace.selectedNetwork,
          nick: selectedBuffer.target,
        }
      : null;
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
    showChannelAutoJoin: props.showChannelAutoJoin,
    channelAutoJoinActive: props.channelAutoJoinActive,
    canDownloadHistory: props.canDownloadHistory,
    onWhoisSelectedQuery: props.onWhoisSelectedQuery,
    onToggleChannelAutoJoin: props.onToggleChannelAutoJoin,
    onDownloadHistory: props.onDownloadHistory,
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
        actions={(
          <PaneHeaderActions
            title={props.workspace.selectedNetwork?.name ?? 'Server'}
            primary={actions.primary}
            overflow={actions.overflow}
          />
        )}
      />
    );
  }
  if (isServerBuffer) {
    return null;
  }
  return (
    <>
      <PaneHeader
        title={props.workspace.headerTitle}
        subtitle={subtitle}
        topicBar={<ChatPaneTopicBar topic={topic} onOpenChannel={props.onOpenMentionedChannel} />}
        actions={(
          <PaneHeaderActions
            title={props.workspace.headerTitle}
            primary={actions.primary}
            contactControls={
              selectedQuery ? (
                <QueryContactControls
                  nick={selectedQuery.nick}
                  friend={selectedFriend}
                  notifications={props.queryNotificationsEnabled ?? false}
                  muted={props.selectedQueryMuted ?? false}
                  onAddFriend={props.onAddFriend}
                  onRemoveFriend={props.onRemoveFriend}
                  onToggleNotifications={props.onToggleQueryNotifications}
                  onMute={props.onMuteSelectedQuery}
                  onUnmute={props.onUnmuteSelectedQuery}
                  onOpenSettings={() => setContactSettingsOpen(true)}
                />
              ) : null
            }
            overflow={actions.overflow}
          />
        )}
      />
      {selectedQuery ? (
        <ContactSettingsDialog
          open={contactSettingsOpen}
          onOpenChange={setContactSettingsOpen}
          networkName={selectedQuery.network.name}
          nick={selectedQuery.nick}
          friend={Boolean(selectedFriend)}
          notifications={props.queryNotificationsEnabled ?? false}
          muted={props.selectedQueryMuted ?? false}
          onFriendChange={(active) => {
            void (active
              ? props.onAddFriend(selectedQuery.nick)
              : selectedFriend && props.onRemoveFriend(selectedFriend.id));
          }}
          onNotificationsChange={(active) => {
            if (active !== Boolean(props.queryNotificationsEnabled)) {
              props.onToggleQueryNotifications?.();
            }
          }}
          onMutedChange={(active) => {
            void (active
              ? props.onMuteSelectedQuery?.()
              : props.onUnmuteSelectedQuery?.());
          }}
        />
      ) : null}
    </>
  );
}

function PaneHeaderActions(props: {
  title: string;
  primary: ChatPaneHeaderAction[];
  contactControls?: ReactNode;
  overflow: ChatPaneHeaderAction[];
}) {
  if (props.primary.length === 0 && !props.contactControls && props.overflow.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {props.primary.map((action) =>
        action.id === 'close-query' ? (
          <Button
            key={action.id}
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground"
            aria-label={`Close ${props.title}`}
            onClick={action.onSelect}
          >
            <X className="size-3.5" />
          </Button>
        ) : (
          <Button key={action.id} variant="outline" size="sm" onClick={action.onSelect}>
            {action.label}
          </Button>
        ),
      )}
      {props.contactControls}
      <ChatPaneHeaderActionMenu actions={props.overflow} />
    </div>
  );
}

function PaneHeader(props: {
  title: string;
  subtitle: string;
  actions: ReactNode;
  topicBar?: ReactNode;
}) {
  return (
    <div className="relative z-20 shrink-0 border-b border-white/6 bg-background/32 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          {props.title ? (
            <h2
              className={cn(
                'truncate text-lg font-semibold tracking-tight text-foreground',
                props.subtitle && 'mb-1',
              )}
            >
              {props.title}
            </h2>
          ) : null}
          {props.subtitle ? (
            <p className="max-w-xl truncate text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              {props.subtitle}
            </p>
          ) : null}
        </div>
        {props.actions}
      </div>
      {props.topicBar ? props.topicBar : null}
    </div>
  );
}

function shouldShowChatPaneHeaderSubtitle(
  workspace: WorkspaceView,
  subtitle: string,
) {
  if (!subtitle) {
    return false;
  }

  return subtitle !== resolveConnectedRuntimeSubtitle(workspace);
}

function resolveConnectedRuntimeSubtitle(workspace: WorkspaceView) {
  const network = workspace.selectedNetwork;
  if (!network) {
    return null;
  }

  const runtimeNick = workspace.selectedRuntime?.nick ?? network.nick;
  const runtimeHost = workspace.selectedRuntime?.serverName ?? 'server';
  return `${runtimeNick} @ ${runtimeHost}`;
}
