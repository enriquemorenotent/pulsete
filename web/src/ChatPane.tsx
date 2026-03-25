import { memo, useState, type RefObject } from 'react';
import type {
  BufferHistoryImportRequest,
  BufferState,
  ChatMessage,
  FriendState,
  NetworkProfile,
} from '../../shared/protocol.js';
import { Card } from '@/components/ui/card.js';
import type { ChannelListState } from './app-types.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import { ChatPaneHeader } from './ChatPaneHeader.js';
import { ChatPaneMessageList } from './ChatPaneMessageList.js';
import { HistoryImportDialog } from './HistoryImportDialog.js';
import { QuerySelfNickAliasesDialog } from './QuerySelfNickAliasesDialog.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  selectedMessages: ChatMessage[];
  draft: string;
  messageDisplayMode: MessageDisplayMode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<void>;
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
  onImportHistory?: (input: BufferHistoryImportRequest) => Promise<boolean>;
  onUpdateSelfNickAliases?: (input: { selfNickAliases: string[] }) => Promise<boolean>;
  canLoadOlderHistory?: boolean;
  loadingOlderHistory?: boolean;
  onLoadOlderHistory?: () => Promise<void>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  channelList: ChannelListState;
  channelListNetwork: NetworkProfile | null;
  onCloseChannelList: () => void;
  onJoinChannelFromList: (channel: string) => Promise<void>;
  onOpenMentionedChannel: (channel: string) => void;
  onOpenChannelList: () => void;
};

export const ChatPane = memo(function ChatPane(props: ChatPaneProps) {
  const [historyImportOpen, setHistoryImportOpen] = useState(false);
  const [selfNickAliasesOpen, setSelfNickAliasesOpen] = useState(false);
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden">
      <Card className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
        <ChatPaneHeader
          workspace={props.workspace}
          friends={props.friends}
          onAddFriend={props.onAddFriend}
          onRemoveFriend={props.onRemoveFriend}
          showChannelAutoJoin={props.showChannelAutoJoin}
          channelAutoJoinActive={props.channelAutoJoinActive}
          onToggleChannelAutoJoin={props.onToggleChannelAutoJoin}
          canClearHistory={props.canClearHistory}
          onClearHistory={props.onClearHistory}
          canDownloadHistory={props.canDownloadHistory}
          onDownloadHistory={props.onDownloadHistory}
          canImportHistory={props.canImportHistory}
          onOpenHistoryImport={props.onImportHistory ? () => setHistoryImportOpen(true) : undefined}
          onOpenSelfNickAliases={
            props.workspace.selectedBuffer?.kind === 'query' && props.onUpdateSelfNickAliases
              ? () => setSelfNickAliasesOpen(true)
              : undefined
          }
          onCloseChannel={props.onCloseChannel}
          onCloseBuffer={props.onCloseBuffer}
          onOpenChannelList={props.onOpenChannelList}
        />
        <ChatPaneMessageList
          bufferKind={props.workspace.selectedBuffer?.kind ?? null}
          messages={props.selectedMessages}
          scrollRef={props.scrollRef}
          emptyBody={props.workspace.emptyBody}
          mode={props.messageDisplayMode}
          listKind={isServerBuffer ? 'server' : 'chat'}
          canLoadOlderHistory={props.canLoadOlderHistory}
          loadingOlderHistory={props.loadingOlderHistory}
          onOpenChannel={props.onOpenMentionedChannel}
          onLoadOlderHistory={props.onLoadOlderHistory}
        />
        {props.workspace.composerMode !== 'hidden' ? (
          <ChatPaneComposer
            draft={props.draft}
            placeholder={props.workspace.composerPlaceholder}
            onDraftChange={props.onDraftChange}
            onRecallOlderDraft={props.onRecallOlderDraft}
            onRecallNewerDraft={props.onRecallNewerDraft}
            onSend={props.onSend}
          />
        ) : null}
      </Card>
      <ChannelListDialog
        network={props.channelListNetwork}
        state={props.channelList}
        onClose={props.onCloseChannelList}
        onJoin={props.onJoinChannelFromList}
      />
      {props.onImportHistory ? (
        <HistoryImportDialog
          open={historyImportOpen}
          targetLabel={props.workspace.headerTitle}
          onClose={() => setHistoryImportOpen(false)}
          onImport={props.onImportHistory}
        />
      ) : null}
      {props.workspace.selectedBuffer?.kind === 'query' && props.onUpdateSelfNickAliases ? (
        <QuerySelfNickAliasesDialog
          open={selfNickAliasesOpen}
          targetLabel={props.workspace.headerTitle}
          currentAliases={props.workspace.selectedBuffer.selfNickAliases ?? []}
          onClose={() => setSelfNickAliasesOpen(false)}
          onSave={props.onUpdateSelfNickAliases}
        />
      ) : null}
    </section>
  );
});
