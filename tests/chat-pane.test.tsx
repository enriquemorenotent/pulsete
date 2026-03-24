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
    canClearHistory: boolean;
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
      canClearHistory={overrides.canClearHistory}
      onClearHistory={async () => true}
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

test('consecutive sender messages repeat the same inline nick label in chat mode', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'first', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'second', ts: 2 }),
  ]);

  const nickLabels = markup.match(/>Joby</g) ?? [];
  assert.equal(nickLabels.length, 2);
  assert.match(markup, /first/);
  assert.match(markup, /second/);
  assert.doesNotMatch(markup, /data-message-avatar=/);
});

test('compact sender rows keep a one-character nick label without avatar markup', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Q', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, />Q</);
  assert.doesNotMatch(markup, /data-message-avatar=/);
});

test('transcript rows render without boxed message chrome', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'plain line', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Server', body: 'Heads up', kind: 'notice', ts: 2 }),
  ]);

  assert.doesNotMatch(markup, /border px-2 py-1\.5/);
});

test('part and quit rows render with distinct tones', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'left', kind: 'part', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'quit', kind: 'quit', ts: 2 }),
  ]);

  assert.match(markup, /text-amber-300/);
  assert.match(markup, /text-red-500/);
});

test('inline image previews move compact chat bodies onto a second line', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'https://example.test/cat.png', ts: 1 }),
  ]);

  assert.match(markup, /grid grid-cols-\[3\.5rem_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(markup, /Inline image preview: cat\.png/);
  assert.match(markup, /<div class="col-start-2 min-w-0 break-words font-sans text-\[13px\] leading-5 text-inherit">/);
});

test('action rows keep the sender label and hide the duplicated nick in the body', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'cubanita', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, />cubanita</);
  assert.match(markup, />waves</);
  assert.ok(!markup.includes('* cubanita'));
});

test('standalone notice rows with a sender render sender text without avatar markup', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Nova', body: 'Heads up', kind: 'notice', ts: 1 }),
  ]);

  assert.match(markup, /Nova/);
  assert.match(markup, />notice</i);
  assert.doesNotMatch(markup, /data-message-avatar=/);
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

test('channel headers expose clear history for normal chat buffers', () => {
  const markup = renderChatPane([], {
    canClearHistory: true,
  });

  assert.match(markup, /Clear history/);
});

test('channel headers hide clear history when the action is not available', () => {
  const markup = renderChatPane([]);

  assert.doesNotMatch(markup, /Clear history/);
});
