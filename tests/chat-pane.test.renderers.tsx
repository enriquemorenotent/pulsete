import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelUserState, ChatMessage, FriendState, MutedNickState, NickEmojiState } from '../shared/protocol.js';
import { ChatPane } from '../web/src/ChatPane.js';
import type { ContactRuleHandlers, ContactRuleState } from '../web/src/contact-notifications/contact-rules.js';
import { closedChannelList, makeQueryWorkspace, makeServerWorkspace, makeWorkspace } from './chat-pane.test.fixtures.js';

export const noopContactRuleHandlers: ContactRuleHandlers = {
  addFriend: async () => true,
  mute: async () => true,
  removeFriend: async () => true,
  toggleNotifications: async () => true,
  unmute: async () => true,
};

export const renderChatPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    showChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
    canLoadOlderHistory: boolean;
    loadingOlderHistory: boolean;
    channelUsers: ChannelUserState[];
    friends: FriendState[];
    nickEmojis: NickEmojiState[];
    mutedNicks: MutedNickState[];
    topic: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeWorkspace({
        channelUsers: overrides.channelUsers,
        topic: overrides.topic,
      })}
      nickEmojis={overrides.nickEmojis ?? []}
      mutedNicks={overrides.mutedNicks ?? []}
      selectedMessages={selectedMessages}
      draft=""
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      contactRuleHandlers={noopContactRuleHandlers}
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
    nickEmojis: NickEmojiState[];
    queryNotificationsEnabled: boolean;
    selectedQueryMuted: boolean;
    mutedQueryNick: string;
    mutedNicks: MutedNickState[];
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeQueryWorkspace()}
      nickEmojis={overrides.nickEmojis ?? []}
      mutedNicks={overrides.mutedNicks ?? []}
      selectedMessages={selectedMessages}
      draft=""
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      contactRuleHandlers={noopContactRuleHandlers}
      selectedQueryContactRule={makeSelectedQueryContactRule({
        friend: overrides.friends?.[0] ?? null,
        muted: overrides.selectedQueryMuted ?? false,
        notificationsEnabled: overrides.queryNotificationsEnabled ?? false,
      })}
      mutedQueryNick={overrides.mutedQueryNick}
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
      nickEmojis={[]}
      mutedNicks={[]}
      selectedMessages={selectedMessages}
      draft=""
      onDraftChange={() => undefined}
      onRecallOlderDraft={() => undefined}
      onRecallNewerDraft={() => undefined}
      onSend={async () => false}
      contactRuleHandlers={noopContactRuleHandlers}
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

const makeSelectedQueryContactRule = (input: {
  friend: FriendState | null;
  muted: boolean;
  notificationsEnabled: boolean;
}): ContactRuleState => ({
  contact: { networkId: 'network-1', nick: 'MissD' },
  friend: input.friend,
  mutedNick: input.muted ? { id: 'mute-1', networkId: 'network-1', nick: 'MissD' } : null,
  notificationsEnabled: !input.muted && input.notificationsEnabled,
});
