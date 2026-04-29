import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, ChannelState, ChatMessage, NetworkProfile } from '../shared/protocol.js';
import type { ChannelListState } from '../web/src/app-types.js';
import { ChatPane } from '../web/src/ChatPane.js';
import type { WorkspaceView } from '../web/src/workspace.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
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
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
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
  nick: overrides.nick === undefined ? 'Data' : overrides.nick,
  body: overrides.body ?? '[Profile for Salamander] Age: 34',
  kind: overrides.kind ?? 'notice',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

const closedChannelList: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  totalEntries: null,
  truncated: false,
  error: null,
};

const makeWorkspace = (): WorkspaceView => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ target: '#roleplayofallkinds' });
  const selectedChannel = makeChannel({
    id: selectedBuffer.id,
    networkId: selectedBuffer.networkId,
    name: selectedBuffer.target,
  });
  return {
    mode: 'channel-connected',
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    workspaceNetworks: [network],
    selectedNetwork: network,
    selectedRuntime: { phase: 'connected', serverName: 'irc.example.test', nick: network.nick },
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

test('chat transcripts render sender notices inline without a notice badge', () => {
  const markup = renderToStaticMarkup(
    <ChatPane
      workspace={makeWorkspace()}
      friends={[]}
      nickEmojis={[]}
      mutedNicks={[]}
      selectedMessages={[makeMessage()]}
      draft=""
      onDraftChange={() => {}}
      onRecallOlderDraft={() => {}}
      onRecallNewerDraft={() => {}}
      onSend={async () => false}
      onAddFriend={async () => false}
      onRemoveFriend={async () => false}
      onSaveNickEmoji={async () => false}
      showChannelAutoJoin={false}
      channelAutoJoinActive={false}
      onToggleChannelAutoJoin={async () => false}
      onCloseChannel={() => {}}
      onCloseBuffer={() => {}}
      channelList={closedChannelList}
      channelListNetwork={null}
      onCloseChannelList={() => {}}
      onJoinChannelFromList={async () => {}}
      onOpenMentionedChannel={() => {}}
      onOpenChannelList={() => {}}
      onOpenParticipantQuery={() => {}}
    />,
  );

  assert.match(markup, /grid items-start grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-inherit[^"]*">Data</);
  assert.doesNotMatch(markup, />notice</i);
  assert.doesNotMatch(markup, /mb-1 flex flex-wrap items-center gap-2 text-\[11px\] uppercase/);
});
