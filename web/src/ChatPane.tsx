import { memo, useCallback, useReducer, useState } from 'react';
import type { BufferState, ChannelUserState, ChatMessage, MutedNickState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import type { ChannelListState } from './app-types.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import type { ChatPaneComposerTarget } from './ChatPaneComposerTargetChip.js';
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
  externalAvatarsEnabled: boolean;
  selectedQueryAvatarUser?: Pick<ChannelUserState, 'host' | 'nick' | 'username'> | null;
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
  canDeleteHistory?: boolean;
  onDeleteHistory?: (buffer: BufferState) => Promise<boolean>;
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
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
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
  const [deleteHistoryBuffer, setDeleteHistoryBuffer] = useState<BufferState | null>(null);
  const [deleteHistoryPending, setDeleteHistoryPending] = useState(false);
  const searchableBuffer = props.canSearchHistory ? props.workspace.selectedBuffer : null;
  const clearableBuffer = props.canDeleteHistory && props.workspace.selectedBuffer?.kind === 'query'
    ? props.workspace.selectedBuffer
    : null;
  const composerTarget = resolveChatPaneComposerTarget(props.workspace);
  const handleSend = useCallback(async () => {
    const submitted = await props.onSend();
    if (submitted) {
      requestFollowOutput();
    }
    return submitted;
  }, [props.onSend]);
  const handleConfirmDeleteHistory = useCallback(async () => {
    if (!deleteHistoryBuffer || !props.onDeleteHistory) {
      return;
    }
    setDeleteHistoryPending(true);
    try {
      const deleted = await props.onDeleteHistory(deleteHistoryBuffer);
      if (deleted) {
        setDeleteHistoryBuffer(null);
      }
    } finally {
      setDeleteHistoryPending(false);
    }
  }, [deleteHistoryBuffer, props.onDeleteHistory]);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <ChatPaneHeader
        workspace={props.workspace}
        nickEmojis={props.nickEmojis}
        contactRuleHandlers={props.contactRuleHandlers}
        externalAvatarsEnabled={props.externalAvatarsEnabled}
        selectedQueryAvatarUser={props.selectedQueryAvatarUser}
        selectedQueryContactRule={props.selectedQueryContactRule}
        onOpenMentionedChannel={props.onOpenMentionedChannel}
        onWhoisSelectedQuery={props.onWhoisSelectedQuery}
        showChannelAutoJoin={props.showChannelAutoJoin}
        channelAutoJoinActive={props.channelAutoJoinActive}
        onToggleChannelAutoJoin={props.onToggleChannelAutoJoin}
        canDownloadHistory={props.canDownloadHistory}
        onDownloadHistory={props.onDownloadHistory}
        canDeleteHistory={Boolean(clearableBuffer && props.onDeleteHistory)}
        onDeleteHistory={clearableBuffer ? () => setDeleteHistoryBuffer(clearableBuffer) : undefined}
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
          target={composerTarget}
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
      <DeleteHistoryDialog
        buffer={deleteHistoryBuffer}
        pending={deleteHistoryPending}
        onCancel={() => setDeleteHistoryBuffer(null)}
        onConfirm={handleConfirmDeleteHistory}
      />
    </section>
  );
});

function resolveChatPaneComposerTarget(workspace: WorkspaceView): ChatPaneComposerTarget | null {
  if (workspace.composerMode === 'hidden') {
    return null;
  }
  if (workspace.composerMode === 'commands') {
    return { kind: 'server', label: workspace.selectedNetwork?.name ?? 'Server' };
  }
  if (workspace.selectedBuffer?.kind === 'channel') {
    return { kind: 'channel', label: workspace.selectedChannel?.name ?? workspace.selectedBuffer.target };
  }
  if (workspace.selectedPendingChannel) {
    return { kind: 'channel', label: workspace.selectedPendingChannel.channel };
  }
  if (workspace.selectedBuffer?.kind === 'query') {
    return { kind: 'query', label: workspace.selectedBuffer.target };
  }
  return null;
}

function DeleteHistoryDialog(props: {
  buffer: BufferState | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(props.buffer)} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className="sm:w-[min(calc(100vw-1rem),28rem)]">
        <DialogHeader>
          <DialogTitle>Delete PM history?</DialogTitle>
          <DialogDescription>
            {props.buffer
              ? `This deletes all saved messages with ${props.buffer.target}. The PM stays open.`
              : 'This deletes the saved messages for this private message. The PM stays open.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={props.onCancel} disabled={props.pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={props.onConfirm} disabled={props.pending}>
            Delete history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
