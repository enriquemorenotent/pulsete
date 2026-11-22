import { QueryMediaGallery } from './QueryMediaGallery.js';
import { useState } from 'react';
import { ContactRound, UserSearch } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button.js';
import { containOverlayKeyDown } from '@/components/ui/overlay-keyboard.js';
import type { BufferState, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { ChannelAutoJoinButton } from './ChannelAutoJoinButton.js';
import { ChannelNotificationButton } from './ChannelNotificationButton.js';
import { ChatPaneTopicBar } from './ChatPaneTopicBar.js';
import { resolveChatPaneHeaderActions } from './chat-pane-header-actions.js';
import { QueryAvatarOptionsMenu } from './QueryAvatarOptionsMenu.js';
import { QueryProfileAvatarBanner, type QueryProfileAvatarUser } from './QueryProfileAvatarBanner.js';
import {
  PaneHeader,
  PaneHeaderActions,
  shouldShowChatPaneHeaderSubtitle,
} from './ChatPaneHeaderLayout.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import { ContactRuleControls } from './contact-notifications/ContactRuleControls.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-notifications/contact-rules.js';
import { NickEmojiEditorControl } from './NickEmojiEditorControl.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import type { InlineImageRenderingMode } from './FormattedMessageText.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  nickEmojis: NickEmojiState[];
  onSaveNickEmoji?: (
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) => Promise<boolean>;
  selectedQueryIdentity?: NetworkUserIdentity | null;
  selectedQueryUser?: QueryProfileAvatarUser | null;
  contactRuleHandlers: ContactRuleHandlers;
  selectedQueryContactRule?: ContactRuleState | null;
  selectedChannelNotificationsEnabled?: boolean;
  inlineImageRendering: InlineImageRenderingMode;
  externalAvatarsEnabled?: boolean;
  profileImagesVisible?: boolean;
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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const { selectedBuffer } = props.workspace;
  const selectedNickEmoji =
    selectedBuffer?.kind === 'query'
      ? findNickEmoji(
          props.nickEmojis,
          selectedBuffer.networkId,
          selectedBuffer.target,
          props.selectedQueryIdentity ?? selectedBuffer.peerIdentity,
        )
      : null;
  const selectedQueryAvatarUser = props.selectedQueryUser ?? (selectedBuffer?.kind === 'query'
    ? {
        account: null,
        host: null,
        identity: props.selectedQueryIdentity ?? selectedBuffer.peerIdentity,
        nick: selectedBuffer.target,
        username: null,
        ircCloudAvatarId: selectedBuffer.ircCloudAvatarId,
      }
    : null);
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
  const selectedAutoJoinChannelName = props.showChannelAutoJoin
    ? props.workspace.selectedChannel?.name
      ?? props.workspace.selectedPendingChannel?.channel
      ?? selectedChannelName
    : null;
  const actions = resolveChatPaneHeaderActions({
    workspace: props.workspace,
    canDownloadHistory: props.canDownloadHistory,
    canDeleteHistory: props.canDeleteHistory,
    canSearchHistory: props.canSearchHistory,
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
        topicBar={(
          <ChatPaneTopicBar
            inlineImageRendering={props.inlineImageRendering}
            topic={topic}
            onOpenChannel={props.onOpenMentionedChannel}
          />
        )}
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
      avatar={props.profileImagesVisible !== false && selectedQueryAvatarUser ? (
        <QueryProfileAvatarBanner
          enabled={props.externalAvatarsEnabled === true}
          networkId={selectedBuffer?.networkId ?? ''}
          onSourceError={setFailedAvatarUrl}
          user={selectedQueryAvatarUser}
          variant="topbar"
        />
      ) : null}
      title={props.workspace.headerTitle}
      emoji={selectedNickEmoji?.emoji ?? null}
      subtitle={subtitle}
      topicBar={(
        <ChatPaneTopicBar
          inlineImageRendering={props.inlineImageRendering}
          topic={topic}
          onOpenChannel={props.onOpenMentionedChannel}
        />
      )}
      actions={(
        <PaneHeaderActions
          title={props.workspace.headerTitle}
          primary={actions.primary}
          contactControls={
            selectedBuffer?.kind === 'query' && selectedQueryAvatarUser ? (
              <>
                <QueryMediaGallery key={selectedBuffer.id} buffer={selectedBuffer} />
                <Popover.Root key={`contact:${selectedBuffer.id}`}>
                  <Popover.Trigger asChild>
                    <Button type="button" variant="outline" aria-label={`Contact settings for ${selectedBuffer.target}`}>
                      <ContactRound data-icon="inline-start" />
                      Contact
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="end"
                      sideOffset={8}
                      collisionPadding={8}
                      aria-label={`Contact settings for ${selectedBuffer.target}`}
                      onKeyDown={containOverlayKeyDown}
                      className="z-50 grid w-56 gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
                    >
                      {props.onSaveNickEmoji ? (
                        <NickEmojiEditorControl
                          showLabel
                          emoji={selectedNickEmoji?.emoji ?? null}
                          nick={selectedBuffer.target}
                          onSave={(emoji) => props.onSaveNickEmoji!(
                            selectedBuffer.networkId,
                            selectedBuffer.target,
                            emoji,
                            props.selectedQueryIdentity ?? selectedBuffer.peerIdentity,
                          )}
                        />
                      ) : null}
                      {props.selectedQueryContactRule ? (
                        <ContactRuleControls
                          showLabels
                          state={props.selectedQueryContactRule}
                          handlers={props.contactRuleHandlers}
                        />
                      ) : null}
                      <QueryAvatarOptionsMenu
                        showLabel
                        externalAvatarsEnabled={props.externalAvatarsEnabled === true}
                        failedAvatarUrl={failedAvatarUrl}
                        networkId={selectedBuffer.networkId}
                        user={selectedQueryAvatarUser}
                      />
                      {props.onWhoisSelectedQuery ? (
                        <Popover.Close asChild>
                          <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={props.onWhoisSelectedQuery}>
                            <UserSearch data-icon="inline-start" />
                            User details (WHOIS)
                          </Button>
                        </Popover.Close>
                      ) : null}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </>
            ) : selectedChannelName || selectedAutoJoinChannelName ? (
              <>
                {selectedChannelName && props.onToggleSelectedChannelNotifications ? (
                  <ChannelNotificationButton
                    active={props.selectedChannelNotificationsEnabled === true}
                    channel={selectedChannelName}
                    onToggle={props.onToggleSelectedChannelNotifications}
                  />
                ) : null}
                {selectedAutoJoinChannelName ? (
                  <ChannelAutoJoinButton
                    active={props.channelAutoJoinActive}
                    channel={selectedAutoJoinChannelName}
                    onToggle={() => {
                      void props.onToggleChannelAutoJoin();
                    }}
                  />
                ) : null}
              </>
            ) : null
          }
          overflow={actions.overflow}
        />
      )}
    />
  );
}
