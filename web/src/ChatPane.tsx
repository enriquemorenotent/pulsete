import { memo, useCallback, useReducer } from 'react';
import type {
  BufferState,
  ChatMessage,
  MutedNickState,
  NetworkProfile,
  NickEmojiState,
} from '../../shared/protocol.js';
import type { ChannelListState } from './app-types.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import { ChatPaneHeader } from './ChatPaneHeader.js';
import { ChatPaneMessageList } from './ChatPaneMessageList.js';
import { ChatPaneStatusBanner } from './ChatPaneStatusBanner.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-notifications/contact-rules.js';
import { HistorySearchDialog } from './HistorySearchDialog.js';
import type { SearchBufferHistory } from './history-search-request.js';
import { defaultMessageDisplayMode } from './message-display-mode.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneProps = {
  workspace: WorkspaceView;
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  selectedMessages: ChatMessage[];
  draft: string;
  focusContextKey?: string | null;
  completionEnabled?: boolean;
  completionContextKey?: string | null;
  completionCandidates?: string[];
  completionCommandCandidates?: string[];
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<boolean>;
  contactRuleHandlers: ContactRuleHandlers;
  selectedQueryContactRule?: ContactRuleState | null;
  mutedQueryNick?: string | null;
  onWhoisSelectedQuery?: () => void;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  canSearchHistory?: boolean;
  onSearchHistory?: SearchBufferHistory;
  canLoadOlderHistory?: boolean;
  initialHistoryPending?: boolean;
  loadingOlderHistory?: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  channelList: ChannelListState;
  channelListNetwork: NetworkProfile | null;
  onCloseChannelList: () => void;
  onJoinChannelFromList: (channel: string) => Promise<void>;
  onOpenMentionedChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onOpenChannelList: () => void;
  onReconnectNetwork?: () => Promise<boolean>;
};

export const ChatPane = memo(function ChatPane(props: ChatPaneProps) {
  const [followOutputRequestId, requestFollowOutput] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
  const [historySearchOpen, setHistorySearchOpen] = useReducer(
    (_open: boolean, nextOpen: boolean) => nextOpen,
    false,
  );
  const searchableBuffer = props.canSearchHistory ? props.workspace.selectedBuffer : null;
  const handleSend = useCallback(async () => {
    const submitted = await props.onSend();
    if (submitted) {
      requestFollowOutput();
    }
    return submitted;
  }, [props.onSend]);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <ChatPaneHeader
        workspace={props.workspace}
        nickEmojis={props.nickEmojis}
        contactRuleHandlers={props.contactRuleHandlers}
        selectedQueryContactRule={props.selectedQueryContactRule}
        onOpenMentionedChannel={props.onOpenMentionedChannel}
        onWhoisSelectedQuery={props.onWhoisSelectedQuery}
        showChannelAutoJoin={props.showChannelAutoJoin}
        channelAutoJoinActive={props.channelAutoJoinActive}
        onToggleChannelAutoJoin={props.onToggleChannelAutoJoin}
        canDownloadHistory={props.canDownloadHistory}
        onDownloadHistory={props.onDownloadHistory}
        canSearchHistory={props.canSearchHistory}
        onOpenHistorySearch={() => setHistorySearchOpen(true)}
        onCloseChannel={props.onCloseChannel}
        onCloseBuffer={props.onCloseBuffer}
        onOpenChannelList={props.onOpenChannelList}
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
        messages={props.selectedMessages}
        mutedNicks={props.mutedNicks}
        emptyBody={props.workspace.emptyBody}
        mode={defaultMessageDisplayMode}
        listKind={isServerBuffer ? 'server' : 'chat'}
        canLoadOlderHistory={props.canLoadOlderHistory}
        initialHistoryPending={props.initialHistoryPending}
        loadingOlderHistory={props.loadingOlderHistory}
        onOpenChannel={props.onOpenMentionedChannel}
        onOpenParticipantQuery={props.onOpenParticipantQuery}
        onLoadOlderHistory={props.onLoadOlderHistory}
      />
      {props.workspace.composerMode !== 'hidden' ? (
        <ChatPaneComposer
          draft={props.draft}
          mode={props.workspace.composerMode}
          placeholder={props.workspace.composerPlaceholder}
          focusContextKey={props.focusContextKey}
          completionEnabled={props.completionEnabled}
          completionContextKey={props.completionContextKey}
          completionCandidates={props.completionCandidates}
          completionCommandCandidates={props.completionCommandCandidates}
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
        open={historySearchOpen && Boolean(searchableBuffer && props.onSearchHistory)}
        buffer={searchableBuffer}
        mode={defaultMessageDisplayMode}
        onOpenChange={setHistorySearchOpen}
        onOpenChannel={props.onOpenMentionedChannel}
        onSearch={props.onSearchHistory}
      />
    </section>
  );
});
