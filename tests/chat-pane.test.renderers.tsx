import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelUserState, ChatMessage, FriendState } from '../shared/protocol.js';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeQueryWorkspace, makeServerWorkspace, makeWorkspace } from './chat-pane.test.fixtures.js';

export const renderChatPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    showChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
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
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      showChannelAutoJoin={overrides.showChannelAutoJoin ?? false}
      channelAutoJoinActive={overrides.channelAutoJoinActive ?? false}
      onToggleChannelAutoJoin={async () => true}
      canLoadOlderHistory={overrides.canLoadOlderHistory}
      loadingOlderHistory={overrides.loadingOlderHistory}
      onLoadOlderHistory={async () => 0}
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
    queryNotificationsEnabled: boolean;
    selectedQueryMuted: boolean;
    mutedQueryNick: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeQueryWorkspace()}
      friends={overrides.friends ?? ([] satisfies FriendState[])}
      selectedMessages={selectedMessages}
      draft=""
      messageDisplayMode="colors"
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      selectedQueryMuted={overrides.selectedQueryMuted}
      mutedQueryNick={overrides.mutedQueryNick}
      queryNotificationsEnabled={overrides.queryNotificationsEnabled ?? false}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onMuteSelectedQuery={async () => true}
      onUnmuteSelectedQuery={async () => true}
      onToggleQueryNotifications={() => undefined}
      showChannelAutoJoin={false}
      channelAutoJoinActive={false}
      onToggleChannelAutoJoin={async () => true}
      canLoadOlderHistory={overrides.canLoadOlderHistory}
      loadingOlderHistory={overrides.loadingOlderHistory}
      onLoadOlderHistory={async () => 0}
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
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      showChannelAutoJoin={false}
      channelAutoJoinActive={false}
      onToggleChannelAutoJoin={async () => true}
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
