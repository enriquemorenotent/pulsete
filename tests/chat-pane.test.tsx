import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, ChannelState, ChatMessage, FriendState, NetworkProfile } from '../shared/protocol.js';
import type { ChannelListState } from '../web/src/app-types.js';
import { ChatPane } from '../web/src/ChatPane.js';
import type { WorkspaceView } from '../web/src/workspace.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? true,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  username: overrides.username ?? 'sofia',
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'channel',
  target: overrides.target ?? '#help',
  unread: overrides.unread ?? 0,
});

const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'channel-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? 'Help channel',
  users: overrides.users ?? [],
});

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick ?? 'Joby',
  body: overrides.body ?? 'hello there',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

const closedChannelList: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  error: null,
};

const makeWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer();
  const selectedChannel = makeChannel({ id: selectedBuffer.id, networkId: selectedBuffer.networkId, name: selectedBuffer.target });
  return {
    mode: 'channel-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    connectionInstances: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel,
    selectedPendingChannel: null,
    headerTitle: selectedChannel.name,
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'normal',
    composerPlaceholder: `Message ${selectedChannel.name}`,
    emptyBody: 'No history yet.',
    showNicklist: true,
  };
};

const renderChatPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    showChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeWorkspace()}
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
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
      channelList={closedChannelList}
      channelListNetwork={null}
      onCloseChannelList={() => undefined}
      onJoinChannelFromList={async () => undefined}
      onOpenMentionedChannel={() => undefined}
      onOpenChannelList={() => undefined}
    />
  );

test('grouped sender messages render one avatar with the first two nickname letters', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'first', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'second', ts: 2 }),
  ]);

  const avatars = markup.match(/data-message-avatar="JO"/g) ?? [];
  assert.equal(avatars.length, 1);
  assert.match(markup, /Joby/);
});

test('compact sender rows keep a one-letter avatar when the nickname is only one character', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Q', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, /data-message-avatar="Q"/);
});

test('action rows keep the sender label and hide the duplicated nick in the body', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'cubanita', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, />cubanita</);
  assert.match(markup, />waves</);
  assert.ok(!markup.includes('* cubanita'));
});

test('standalone notice rows with a sender render the same avatar fallback', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Nova', body: 'Heads up', kind: 'notice', ts: 1 }),
  ]);

  assert.match(markup, /data-message-avatar="NO"/);
  assert.match(markup, /Nova/);
  assert.match(markup, />notice</i);
});

test('channel headers can render an active autojoin toggle', () => {
  const markup = renderChatPane([], {
    showChannelAutoJoin: true,
    channelAutoJoinActive: true,
  });

  assert.match(markup, /Autojoin On/);
  assert.match(markup, /aria-pressed="true"/);
});

test('channel headers render an inactive autojoin toggle state', () => {
  const markup = renderChatPane([], {
    showChannelAutoJoin: true,
    channelAutoJoinActive: false,
  });

  assert.match(markup, /Autojoin Off/);
  assert.match(markup, /aria-pressed="false"/);
});
