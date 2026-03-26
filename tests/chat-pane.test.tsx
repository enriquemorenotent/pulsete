import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, ChannelState, ChannelUserState, ChatMessage, FriendState, NetworkProfile } from '../shared/protocol.js';
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
  nick: overrides.nick === undefined ? 'Joby' : overrides.nick,
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

const makeWorkspace = (overrides: Partial<{ channelUsers: ChannelUserState[] }> = {}): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer();
  const selectedChannel = makeChannel({
    id: selectedBuffer.id,
    networkId: selectedBuffer.networkId,
    name: selectedBuffer.target,
    users: overrides.channelUsers ?? [],
  });
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

const makeQueryWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ kind: 'query', target: 'MissD' });
  return {
    mode: 'query-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    connectionInstances: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: selectedBuffer.target,
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'normal',
    composerPlaceholder: `Message ${selectedBuffer.target}`,
    emptyBody: 'No history yet.',
    showNicklist: false,
  };
};

const makeServerWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ kind: 'server', target: 'server' });
  return {
    mode: 'server-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    connectionInstances: [network],
    selectedNetwork: network,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: network.nick,
    },
    selectedBuffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: 'Server',
    headerSubtitle: `${network.nick} @ irc.example.test`,
    composerMode: 'commands',
    composerPlaceholder: 'Send an IRC command',
    emptyBody: 'No server messages yet.',
    showNicklist: false,
  };
};

const renderChatPane = (
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
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeWorkspace({ channelUsers: overrides.channelUsers })}
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

const renderQueryPane = (
  selectedMessages: ChatMessage[],
  overrides: Partial<{
    canLoadOlderHistory: boolean;
    loadingOlderHistory: boolean;
  }> = {},
) =>
  renderToStaticMarkup(
    <ChatPane
      workspace={makeQueryWorkspace()}
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

const renderServerPane = (selectedMessages: ChatMessage[]) =>
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

test('compact chat rows use one grid skeleton for plain text and inline previews', () => {
  const plainMarkup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'plain line', ts: 1 }),
  ]);
  const previewMarkup = renderChatPane([
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'Look https://example.test/cat.png', ts: 1 }),
  ]);

  assert.match(plainMarkup, /grid items-baseline grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(previewMarkup, /grid items-baseline grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(previewMarkup, /Inline image preview: cat\.png/);
  assert.match(previewMarkup, /Look /);
  assert.doesNotMatch(previewMarkup, /col-start-2/);
});

test('message rows render a full date and time timestamp', () => {
  const markup = renderChatPane([
    makeMessage({
      id: 'message-1',
      nick: 'Joby',
      body: 'timestamped',
      ts: new Date(2026, 2, 11, 2, 57, 36, 0).getTime(),
    }),
  ]);

  assert.match(markup, /2026-03-11 02:57:36/);
  assert.match(markup, /font-sans tabular-nums text-\[11px\] leading-5 text-muted-foreground/);
});

test('private-message rows color self and peer nick labels differently', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'sofia', self: true, target: 'MissD', body: 'hey', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'MissD', self: false, target: 'MissD', body: 'hi', ts: 2 }),
  ]);

  assert.match(markup, /class="mr-2 font-sans font-semibold text-primary">sofia</);
  assert.match(markup, /class="mr-2 font-sans font-semibold text-success">MissD</);
});

test('channel rows highlight self nick labels without tinting normal participants', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'sofia', self: true, body: 'my line', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'plain line', ts: 2 }),
  ]);

  assert.match(markup, /class="mr-2 font-sans font-semibold text-primary">sofia</);
  assert.match(markup, /aria-label="Open private message with Joby"/);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-inherit[^"]*">Joby</);
  assert.doesNotMatch(markup, /aria-label="Open private message with sofia"/);
});

test('channel rows tint peer nick labels by their channel mode', () => {
  const markup = renderChatPane(
    [
      makeMessage({ id: 'message-1', nick: 'Opal', body: 'operator line', ts: 1 }),
      makeMessage({ id: 'message-2', nick: 'Vox', body: 'voiced line', ts: 2 }),
      makeMessage({ id: 'message-3', nick: 'Guest', body: 'plain line', ts: 3 }),
    ],
    {
      channelUsers: [
        { nick: 'Opal', mode: 'op' },
        { nick: 'Vox', mode: 'voice' },
        { nick: 'Guest', mode: 'normal' },
      ],
    },
  );

  assert.match(markup, /aria-label="Open private message with Opal"/);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-amber-300[^"]*">Opal</);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-emerald-300[^"]*">Vox</);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-inherit[^"]*">Guest</);
});

test('query and server transcripts keep participant labels non-clickable', () => {
  const queryMarkup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'hi', ts: 1 }),
  ]);
  const serverMarkup = renderServerPane([
    makeMessage({ id: 'message-1', nick: 'OperServ', kind: 'notice', body: 'maintenance', ts: 1 }),
  ]);

  assert.doesNotMatch(queryMarkup, /aria-label="Open private message with MissD"/);
  assert.doesNotMatch(serverMarkup, /aria-label="Open private message with OperServ"/);
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

test('server tab rows keep inline source labels instead of grouped headers', () => {
  const markup = renderServerPane([
    makeMessage({ id: 'message-1', nick: null, body: 'Connected', kind: 'system', ts: 1 }),
    makeMessage({ id: 'message-2', nick: null, body: 'Welcome', kind: 'system', ts: 2 }),
    makeMessage({ id: 'message-3', nick: null, body: 'Maintenance soon', kind: 'notice', ts: 3 }),
  ]);

  const serverLabels = markup.match(/>Server</g) ?? [];
  assert.equal(serverLabels.length, 2);
  assert.match(markup, />Notice</);
  assert.match(markup, /grid items-baseline grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1 font-sans/);
  assert.doesNotMatch(markup, /opacity-0 transition-opacity/);
  assert.doesNotMatch(markup, /text-\[15px\] font-semibold/);
  assert.doesNotMatch(markup, /flex min-w-0 flex-wrap items-baseline/);
  assert.match(markup, /<p class="min-w-0 break-words font-sans text-\[13px\] leading-5 text-inherit">/);
});

test('query transcripts show a load older control when earlier history is available', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    canLoadOlderHistory: true,
  });

  assert.match(markup, /Load older/);
});

test('query transcripts show a loading state while older history is being fetched', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    canLoadOlderHistory: true,
    loadingOlderHistory: true,
  });

  assert.match(markup, /Loading older\.\.\./);
  assert.match(markup, /disabled=""/);
});

test('server transcripts do not render the load older control', () => {
  const markup = renderServerPane([
    makeMessage({ id: 'message-1', nick: null, body: 'Connected', kind: 'system', ts: 1 }),
  ]);

  assert.doesNotMatch(markup, /Load older/);
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

test('channel headers expose log import for normal chat buffers', () => {
  const markup = renderChatPane([], {
    canImportHistory: true,
  });

  assert.match(markup, /Import logs/);
});

test('channel headers expose self aliases repair for imported history', () => {
  const markup = renderChatPane([], {
    canRepairSelfNickAliases: true,
  });

  assert.match(markup, /Self aliases/);
});

test('channel headers hide clear history when the action is not available', () => {
  const markup = renderChatPane([]);

  assert.doesNotMatch(markup, /Clear history/);
});
