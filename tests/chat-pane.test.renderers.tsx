import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelUserState, ChatMessage, FriendState } from '../shared/protocol.js';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeQueryWorkspace, makeServerWorkspace, makeWorkspace } from './chat-pane.test.fixtures.js';

export const renderChatPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    showChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
    canClearHistory: boolean;
    canImportHistory: boolean;
    canRepairSelfNickAliases: boolean;
    canLoadOlderHistory: boolean;
    loadingOlderHistory: boolean;
    channelUsers: ChannelUserState[];
    topic: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeWorkspace({
        channelUsers: overrides.channelUsers,
        topic: overrides.topic,
      })}
      friends={[] satisfies FriendState[]}
      selectedMessages={selectedMessages}
      draft=""
      messageDisplayMode="colors"
      scrollRef={createRef<HTMLDivElement>()}
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => undefined}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      showChannelAutoJoin={overrides.showChannelAutoJoin ?? false}
      channelAutoJoinActive={overrides.channelAutoJoinActive ?? false}
      onToggleChannelAutoJoin={async () => true}
      canClearHistory={overrides.canClearHistory}
      onClearHistory={async () => true}
      canImportHistory={overrides.canImportHistory}
      historyImportOpen={false}
      onOpenHistoryImport={overrides.canImportHistory ? () => undefined : undefined}
      onCloseHistoryImport={() => undefined}
      onImportHistory={async () => true}
      selfNickAliasesOpen={false}
      onOpenSelfNickAliases={overrides.canRepairSelfNickAliases ? () => undefined : undefined}
      onCloseSelfNickAliases={() => undefined}
      onUpdateSelfNickAliases={overrides.canRepairSelfNickAliases ? async () => true : undefined}
      canLoadOlderHistory={overrides.canLoadOlderHistory}
      loadingOlderHistory={overrides.loadingOlderHistory}
      onLoadOlderHistory={async () => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
      channelList={closedChannelList}
      channelListNetwork={null}
      onCloseChannelList={() => undefined}
      onJoinChannelFromList={async () => undefined}
      onOpenMentionedChannel={() => undefined}
      onOpenParticipantQuery={() => undefined}
      onOpenChannelList={() => undefined}
    />
  );

export const renderQueryPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    canLoadOlderHistory: boolean;
    loadingOlderHistory: boolean;
    friends: FriendState[];
    onJumpToLatest: () => void;
    queryNotificationsEnabled: boolean;
    scrollRef: { current: HTMLDivElement | null };
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeQueryWorkspace()}
      friends={overrides.friends ?? ([] satisfies FriendState[])}
      selectedMessages={selectedMessages}
      draft=""
      messageDisplayMode="colors"
      scrollRef={overrides.scrollRef ?? createRef<HTMLDivElement>()}
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => undefined}
      queryNotificationsEnabled={overrides.queryNotificationsEnabled ?? false}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onToggleQueryNotifications={() => undefined}
      showChannelAutoJoin={false}
      channelAutoJoinActive={false}
      onToggleChannelAutoJoin={async () => true}
      historyImportOpen={false}
      onCloseHistoryImport={() => undefined}
      selfNickAliasesOpen={false}
      onCloseSelfNickAliases={() => undefined}
      canLoadOlderHistory={overrides.canLoadOlderHistory}
      loadingOlderHistory={overrides.loadingOlderHistory}
      onJumpToLatest={overrides.onJumpToLatest}
      onLoadOlderHistory={async () => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
      channelList={closedChannelList}
      channelListNetwork={null}
      onCloseChannelList={() => undefined}
      onJoinChannelFromList={async () => undefined}
      onOpenMentionedChannel={() => undefined}
      onOpenParticipantQuery={() => undefined}
      onOpenChannelList={() => undefined}
    />
  );

export const renderServerPane = (selectedMessages: ChatMessage[]) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeServerWorkspace()}
      friends={[] satisfies FriendState[]}
      selectedMessages={selectedMessages}
      draft=""
      messageDisplayMode="colors"
      scrollRef={createRef<HTMLDivElement>()}
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => undefined}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      showChannelAutoJoin={false}
      channelAutoJoinActive={false}
      onToggleChannelAutoJoin={async () => true}
      historyImportOpen={false}
      onCloseHistoryImport={() => undefined}
      selfNickAliasesOpen={false}
      onCloseSelfNickAliases={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
      channelList={closedChannelList}
      channelListNetwork={null}
      onCloseChannelList={() => undefined}
      onJoinChannelFromList={async () => undefined}
      onOpenMentionedChannel={() => undefined}
      onOpenParticipantQuery={() => undefined}
      onOpenChannelList={() => undefined}
    />
  );
