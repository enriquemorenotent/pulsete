import type { BufferState, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { ChannelNotificationButton } from './ChannelNotificationButton.js';
import { ChatPaneTopicBar } from './ChatPaneTopicBar.js';
import { resolveChatPaneHeaderActions } from './chat-pane-header-actions.js';
import {
  PaneHeader,
  PaneHeaderActions,
  shouldShowChatPaneHeaderSubtitle,
} from './ChatPaneHeaderLayout.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import { ContactRuleControls } from './contact-notifications/ContactRuleControls.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-notifications/contact-rules.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import { UserAvatar } from './user-avatars/UserAvatar.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  nickEmojis: NickEmojiState[];
  selectedQueryIdentity?: NetworkUserIdentity | null;
  contactRuleHandlers: ContactRuleHandlers;
  selectedQueryContactRule?: ContactRuleState | null;
  selectedChannelNotificationsEnabled?: boolean;
  onToggleSelectedChannelNotifications?: () => void;
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
          props.selectedQueryIdentity,
        )
      : null;
  const selectedQueryAvatarTarget = selectedBuffer?.kind === 'query'
    ? {
        identity: props.selectedQueryIdentity ?? selectedBuffer.peerIdentity,
        networkId: selectedBuffer.networkId,
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
  const selectedChannelName = selectedBuffer?.kind === 'channel'
    ? props.workspace.selectedChannel?.name ?? selectedBuffer.target
    : null;
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
      avatar={selectedQueryAvatarTarget ? (
        <UserAvatar
          customAvatarAllowNickFallback
          customAvatarTarget={selectedQueryAvatarTarget}
          enabled={false}
          placeholder="none"
          size="md"
          user={{
            account: null,
            host: null,
            identity: selectedQueryAvatarTarget.identity,
            nick: selectedQueryAvatarTarget.nick,
            username: null,
          }}
        />
      ) : null}
      title={props.workspace.headerTitle}
      emoji={selectedNickEmoji?.emoji ?? null}
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
            ) : selectedChannelName && props.onToggleSelectedChannelNotifications ? (
              <ChannelNotificationButton
                active={props.selectedChannelNotificationsEnabled === true}
                channel={selectedChannelName}
                onToggle={props.onToggleSelectedChannelNotifications}
              />
            ) : null
          }
          overflow={actions.overflow}
        />
      )}
    />
  );
}
