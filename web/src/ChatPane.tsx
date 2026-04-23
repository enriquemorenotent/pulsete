import { memo, useCallback, useReducer } from 'react';
import type {
  BufferHistoryImportRequest,
  BufferState,
  ChatMessage,
  FriendState,
  NetworkProfile,
} from '../../shared/protocol.js';
import type { ChannelListState } from './app-types.js';
import { BufferSelfNickAliasesDialog } from './BufferSelfNickAliasesDialog.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import { ChatPaneHeader } from './ChatPaneHeader.js';
import { ChatPaneMessageList } from './ChatPaneMessageList.js';
import { ChatPaneStatusBanner } from './ChatPaneStatusBanner.js';
import { HistoryImportDialog } from './HistoryImportDialog.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  selectedMessages: ChatMessage[];
  draft: string;
  focusContextKey?: string | null;
  completionEnabled?: boolean;
  completionContextKey?: string | null;
  completionCandidates?: string[];
  messageDisplayMode: MessageDisplayMode;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<boolean>;
  selectedQueryMuted?: boolean;
  mutedQueryNick?: string | null;
  queryNotificationsEnabled?: boolean;
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
  canImportHistory?: boolean;
  historyImportOpen?: boolean;
  onOpenHistoryImport?: () => void;
  onCloseHistoryImport?: () => void;
  onImportHistory?: (input: BufferHistoryImportRequest) => Promise<boolean>;
  selfNickAliasesOpen?: boolean;
  onOpenSelfNickAliases?: () => void;
  onCloseSelfNickAliases?: () => void;
  onUpdateSelfNickAliases?: (input: { selfNickAliases: string[] }) => Promise<boolean>;
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
  const selectedBuffer = props.workspace.selectedBuffer;
  const selectedChatBuffer: (BufferState & { kind: 'channel' | 'query' }) | null =
    selectedBuffer && (selectedBuffer.kind === 'channel' || selectedBuffer.kind === 'query')
      ? selectedBuffer as BufferState & { kind: 'channel' | 'query' }
    : null;
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
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
        friends={props.friends}
        selectedQueryMuted={props.selectedQueryMuted}
        queryNotificationsEnabled={props.queryNotificationsEnabled}
        onOpenMentionedChannel={props.onOpenMentionedChannel}
        onAddFriend={props.onAddFriend}
        onRemoveFriend={props.onRemoveFriend}
        onMuteSelectedQuery={props.onMuteSelectedQuery}
        onUnmuteSelectedQuery={props.onUnmuteSelectedQuery}
        onToggleQueryNotifications={props.onToggleQueryNotifications}
        onWhoisSelectedQuery={props.onWhoisSelectedQuery}
        showChannelAutoJoin={props.showChannelAutoJoin}
        channelAutoJoinActive={props.channelAutoJoinActive}
        onToggleChannelAutoJoin={props.onToggleChannelAutoJoin}
        canDownloadHistory={props.canDownloadHistory}
        onDownloadHistory={props.onDownloadHistory}
        canImportHistory={props.canImportHistory}
        onOpenHistoryImport={props.onOpenHistoryImport}
        onOpenSelfNickAliases={props.onOpenSelfNickAliases}
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
        followOutputRequestId={followOutputRequestId}
        messages={props.selectedMessages}
        emptyBody={props.workspace.emptyBody}
        mode={props.messageDisplayMode}
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
      {props.onImportHistory ? (
        <HistoryImportDialog
          open={props.historyImportOpen ?? false}
          targetLabel={props.workspace.headerTitle}
          targetKind={selectedChatBuffer?.kind ?? 'query'}
          onClose={() => props.onCloseHistoryImport?.()}
          onImport={props.onImportHistory}
        />
      ) : null}
      {selectedChatBuffer && props.onUpdateSelfNickAliases ? (
        <BufferSelfNickAliasesDialog
          open={props.selfNickAliasesOpen ?? false}
          targetLabel={props.workspace.headerTitle}
          bufferKind={selectedChatBuffer.kind}
          currentAliases={selectedChatBuffer.selfNickAliases ?? []}
          onClose={() => props.onCloseSelfNickAliases?.()}
          onSave={props.onUpdateSelfNickAliases}
        />
      ) : null}
    </section>
  );
});
