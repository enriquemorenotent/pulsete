import { memo, useCallback, useReducer } from 'react';
import type { BufferState, ChatMessage, MutedNickState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import type { ChannelListState } from './app-types.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import { ChatPaneHeader } from './ChatPaneHeader.js';
import { ChatPaneMessageList } from './ChatPaneMessageList.js';
import { ChatPaneStatusBanner } from './ChatPaneStatusBanner.js';
import { DeleteHistoryDialog } from './DeleteHistoryDialog.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-notifications/contact-rules.js';
import { HistorySearchDialog } from './HistorySearchDialog.js';
import type { QueryProfileAvatarUser } from './QueryProfileAvatarBanner.js';
import type { InlineImageRenderingMode } from './FormattedMessageText.js';
import type { SearchBufferHistory } from './history-search-request.js';
import { defaultMessageDisplayMode } from './message-display-mode.js';
import { resolveChatPaneComposerTarget } from './chat-pane-composer-target.js';
import { useChatPaneDialogs } from './useChatPaneDialogs.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneProps = {
  workspace: WorkspaceView;
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  selectedQueryIdentity?: NetworkUserIdentity | null;
  selectedQueryUser?: QueryProfileAvatarUser | null;
  selectedMessages: ChatMessage[];
  draft: string;
  focusContextKey?: string | null;
  completionEnabled?: boolean;
  completionContextKey?: string | null;
  completionCandidates?: string[];
  completionCommandCandidates?: string[];
  jumpToLatestRequestId?: number;
  messageFocusRequest?: {
    bufferId: string;
    messageId: string;
    requestId: number;
  } | null;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<boolean>;
  contactRuleHandlers: ContactRuleHandlers;
  showMedia?: boolean;
  externalAvatarsEnabled?: boolean;
  selectedQueryContactRule?: ContactRuleState | null;
  selectedChannelNotificationsEnabled?: boolean;
  onToggleSelectedChannelNotifications?: () => void;
  mutedQueryNick?: string | null;
  onWhoisSelectedQuery?: () => void;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  canDeleteHistory?: boolean;
  onDeleteHistory?: (buffer: BufferState) => Promise<boolean>;
  canSearchHistory?: boolean;
  onSearchHistory?: SearchBufferHistory;
  canLoadOlderHistory?: boolean;
  initialHistoryPending?: boolean;
  loadingOlderHistory?: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  hasNewerHistory?: boolean;
  onReturnToLatest?: () => Promise<boolean>;
  canPinMessages?: boolean;
  onSetMessagePinned?: (bufferId: string, messageId: string, pinned: boolean) => Promise<boolean>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  channelList: ChannelListState;
  channelListNetwork: NetworkProfile | null;
  onCloseChannelList: () => void;
  onJoinChannelFromList: (channel: string) => Promise<void>;
  onOpenMentionedChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  onOpenChannelList: () => void;
  onReconnectNetwork?: () => Promise<boolean>;
};

export const ChatPane = memo(function ChatPane(props: ChatPaneProps) {
  const [followOutputRequestId, requestFollowOutput] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const [returnToLatestRequestId, requestReturnToLatest] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
  const searchableBuffer = props.canSearchHistory ? props.workspace.selectedBuffer : null;
  const dialogs = useChatPaneDialogs({
    canDeleteHistory: props.canDeleteHistory,
    onDeleteHistory: props.onDeleteHistory,
    selectedBuffer: props.workspace.selectedBuffer,
  });
  const composerTarget = resolveChatPaneComposerTarget(props.workspace);
  const showMedia = props.showMedia !== false;
  const inlineImageRendering: InlineImageRenderingMode =
    showMedia ? 'preview' : 'link';
  const handleSend = useCallback(async () => {
    const submitted = await props.onSend();
    if (submitted) {
      if (props.hasNewerHistory && props.onReturnToLatest) {
        const returned = await props.onReturnToLatest();
        if (!returned) {
          return submitted;
        }
        requestReturnToLatest();
        return submitted;
      }
      requestFollowOutput();
    }
    return submitted;
  }, [props.hasNewerHistory, props.onReturnToLatest, props.onSend]);
  const handleReturnToLatest = useCallback(async () => {
    const returned = await props.onReturnToLatest?.();
    if (returned) {
      requestReturnToLatest();
    }
    return returned ?? false;
  }, [props.onReturnToLatest]);
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <ChatPaneHeader
        workspace={props.workspace}
        nickEmojis={props.nickEmojis}
        selectedQueryIdentity={props.selectedQueryIdentity}
        selectedQueryUser={props.selectedQueryUser}
        contactRuleHandlers={props.contactRuleHandlers}
        selectedQueryContactRule={props.selectedQueryContactRule}
        selectedChannelNotificationsEnabled={props.selectedChannelNotificationsEnabled}
        onToggleSelectedChannelNotifications={props.onToggleSelectedChannelNotifications}
        onOpenMentionedChannel={props.onOpenMentionedChannel}
        onWhoisSelectedQuery={props.onWhoisSelectedQuery}
        showChannelAutoJoin={props.showChannelAutoJoin}
        channelAutoJoinActive={props.channelAutoJoinActive}
        onToggleChannelAutoJoin={props.onToggleChannelAutoJoin}
        canDownloadHistory={props.canDownloadHistory}
        onDownloadHistory={props.onDownloadHistory}
        canDeleteHistory={Boolean(dialogs.clearableBuffer && props.onDeleteHistory)}
        onDeleteHistory={dialogs.clearableBuffer ? dialogs.openDeleteHistory : undefined}
        canSearchHistory={props.canSearchHistory}
        onOpenHistorySearch={dialogs.openHistorySearch}
        onCloseChannel={props.onCloseChannel}
        onCloseBuffer={props.onCloseBuffer}
        onOpenChannelList={props.onOpenChannelList}
        inlineImageRendering={inlineImageRendering}
        externalAvatarsEnabled={props.externalAvatarsEnabled}
        profileImagesVisible={showMedia}
      />
      <ChatPaneStatusBanner
        workspace={props.workspace}
        mutedQueryNick={props.mutedQueryNick}
        onReconnectNetwork={props.onReconnectNetwork}
        onRejoinChannel={props.onOpenMentionedChannel}
      />
      <ChatPaneMessageList
        selectedBuffer={props.workspace.selectedBuffer}
        channelUsers={props.workspace.selectedChannel?.users ?? []}
        nickEmojis={props.nickEmojis}
        followOutputRequestId={followOutputRequestId}
        jumpToLatestRequestId={(props.jumpToLatestRequestId ?? 0) + returnToLatestRequestId}
        messageFocusRequest={props.messageFocusRequest}
        messages={props.selectedMessages}
        mutedNicks={props.mutedNicks}
        emptyBody={props.workspace.emptyBody}
        mode={defaultMessageDisplayMode}
        inlineImageRendering={inlineImageRendering}
        listKind={isServerBuffer ? 'server' : 'chat'}
        canLoadOlderHistory={props.canLoadOlderHistory}
        initialHistoryPending={props.initialHistoryPending}
        loadingOlderHistory={props.loadingOlderHistory}
        onOpenChannel={props.onOpenMentionedChannel}
        onOpenParticipantQuery={props.onOpenParticipantQuery}
        onLoadOlderHistory={props.onLoadOlderHistory}
        hasNewerHistory={props.hasNewerHistory}
        onReturnToLatest={props.onReturnToLatest ? handleReturnToLatest : undefined}
        canPinMessages={props.canPinMessages}
        onSetMessagePinned={props.onSetMessagePinned}
      />
      {props.workspace.composerMode !== 'hidden' ? (
        <ChatPaneComposer
          draft={props.draft}
          mode={props.workspace.composerMode}
          disabled={props.workspace.composerDisabled === true}
          placeholder={props.workspace.composerPlaceholder}
          target={composerTarget}
          focusContextKey={props.focusContextKey}
          completionEnabled={props.completionEnabled}
          completionContextKey={props.completionContextKey}
          completionCandidates={props.completionCandidates}
          completionCommandCandidates={props.completionCommandCandidates}
          focusRequestId={props.jumpToLatestRequestId ?? 0}
          onDraftChange={props.onDraftChange}
          onRecallOlderDraft={props.onRecallOlderDraft}
          onRecallNewerDraft={props.onRecallNewerDraft}
          onSend={handleSend}
        />
      ) : null}
      <ChannelListDialog
        network={props.channelListNetwork}
        state={props.channelList}
        onClose={props.onCloseChannelList}
        onJoin={props.onJoinChannelFromList}
      />
      <HistorySearchDialog
        open={dialogs.historySearchOpen && Boolean(searchableBuffer && props.onSearchHistory)}
        buffer={searchableBuffer}
        mode={defaultMessageDisplayMode}
        inlineImageRendering={inlineImageRendering}
        onOpenChange={dialogs.setHistorySearchOpen}
        onOpenChannel={props.onOpenMentionedChannel}
        onSearch={props.onSearchHistory}
      />
      <DeleteHistoryDialog
        buffer={dialogs.deleteHistoryBuffer}
        pending={dialogs.deleteHistoryPending}
        onCancel={dialogs.closeDeleteHistory}
        onConfirm={dialogs.confirmDeleteHistory}
      />
    </section>
  );
});
