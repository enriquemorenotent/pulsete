import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { BufferState, ChannelUserState, NickEmojiState } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPaneHeaderActionMenu } from './ChatPaneHeaderActionMenu.js';
import { ChatPaneTopicBar } from './ChatPaneTopicBar.js';
import { resolveChatPaneHeaderActions, type ChatPaneHeaderAction } from './chat-pane-header-actions.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import { ContactRuleControls } from './contact-notifications/ContactRuleControls.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-notifications/contact-rules.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import { UserAvatar } from './user-avatars/UserAvatar.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  nickEmojis: NickEmojiState[];
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  selectedQueryAvatarUser?: (Pick<ChannelUserState, 'host' | 'identity' | 'nick' | 'username'> & {
    ircCloudAvatarId?: string | null;
  }) | null;
  selectedQueryContactRule?: ContactRuleState | null;
  onOpenMentionedChannel: (channel: string) => void;
  onWhoisSelectedQuery?: () => void;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  canDeleteHistory?: boolean;
  onDeleteHistory?: () => void;
  canSearchHistory?: boolean;
  onOpenHistorySearch?: () => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenChannelList: () => void;
};

export function ChatPaneHeader(props: ChatPaneHeaderProps) {
  const { selectedBuffer } = props.workspace;
  const selectedNickEmoji =
    selectedBuffer?.kind === 'query'
      ? findNickEmoji(
          props.nickEmojis,
          selectedBuffer.networkId,
          selectedBuffer.target,
          props.selectedQueryAvatarUser?.identity,
        )
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
    canDeleteHistory: props.canDeleteHistory,
    canSearchHistory: props.canSearchHistory,
    onWhoisSelectedQuery: props.onWhoisSelectedQuery,
    onToggleChannelAutoJoin: props.onToggleChannelAutoJoin,
    onDownloadHistory: props.onDownloadHistory,
    onDeleteHistory: props.onDeleteHistory,
    onOpenHistorySearch: props.onOpenHistorySearch,
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
    <PaneHeader
      title={props.workspace.headerTitle}
      emoji={selectedNickEmoji?.emoji ?? null}
      externalAvatarsEnabled={props.externalAvatarsEnabled}
      avatarUser={
        selectedBuffer?.kind === 'query'
          ? props.selectedQueryAvatarUser ?? null
          : null
      }
      subtitle={subtitle}
      topicBar={<ChatPaneTopicBar topic={topic} onOpenChannel={props.onOpenMentionedChannel} />}
      actions={(
        <PaneHeaderActions
          title={props.workspace.headerTitle}
          primary={actions.primary}
          contactControls={
            props.selectedQueryContactRule ? (
              <ContactRuleControls
                state={props.selectedQueryContactRule}
                handlers={props.contactRuleHandlers}
              />
            ) : null
          }
          overflow={actions.overflow}
        />
      )}
    />
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
  avatarUser?: (Pick<ChannelUserState, 'host' | 'nick' | 'username'> & {
    ircCloudAvatarId?: string | null;
  }) | null;
  emoji?: string | null;
  externalAvatarsEnabled?: boolean;
  subtitle: string;
  actions: ReactNode;
  topicBar?: ReactNode;
}) {
  return (
    <div className="relative z-20 shrink-0 border-b border-white/6 bg-background/90 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          {props.title ? (
            <h2
              className={cn(
                'flex min-w-0 items-center gap-2 truncate text-lg font-semibold tracking-tight text-foreground',
                props.subtitle && 'mb-1',
              )}
            >
              <UserAvatar
                enabled={props.externalAvatarsEnabled === true}
                placeholder="initial"
                preview
                size="md"
                user={props.avatarUser}
              />
              <span className="truncate">{props.title}</span>
              {props.emoji ? (
                <span aria-hidden className="shrink-0 leading-none">
                  {props.emoji}
                </span>
              ) : null}
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
