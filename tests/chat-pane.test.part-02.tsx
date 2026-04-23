import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FriendState } from '../shared/protocol.js';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeBuffer, makeChannel, makeMessage, makeNetwork, makeWorkspace } from './chat-pane.test.fixtures.js';
import { renderChatPane, renderQueryPane, renderServerPane } from './chat-pane.test.renderers.js';

test('channel transcripts keep the unread divider anchored after a day divider', () => {
  const messages = [
    makeMessage({ id: 'message-1', body: 'older', ts: new Date(1999, 11, 31, 23, 58, 0, 0).getTime() }),
    makeMessage({ id: 'message-2', body: 'newer', ts: new Date(2000, 0, 1, 0, 3, 0, 0).getTime() }),
  ];
  const markup = renderToStaticMarkup(
    <ChatPane
      workspace={{
        ...makeWorkspace(),
        selectedBuffer: makeBuffer({
          unread: 1,
          lastReadMessageId: 'message-1',
        }),
      }}
      friends={[] satisfies FriendState[]}
      selectedMessages={messages}
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

  assert.match(markup, /New messages/);
  assert.match(markup, /1999-12-31/);
  assert.match(markup, /2000-01-01[\s\S]*New messages[\s\S]*newer/);
  assert.match(markup, /older/);
  assert.match(markup, /newer/);
});

test('channel headers collapse maintenance actions behind a compact overflow trigger', () => {
  const markup = renderChatPane([], {
    showChannelAutoJoin: true,
    channelAutoJoinActive: true,
    canImportHistory: true,
    canRepairSelfNickAliases: true,
  });

  assert.match(markup, /aria-label="More actions"/);
  assert.match(markup, />Close</);
  assert.doesNotMatch(markup, /Autojoin On/);
  assert.doesNotMatch(markup, /Import logs/);
  assert.doesNotMatch(markup, /Self aliases/);
});

test('channel composers render the active target as a prompt cue', () => {
  const markup = renderChatPane([]);

  assert.match(markup, />Send</);
  assert.match(markup, /placeholder="Message #help"/);
  assert.doesNotMatch(markup, />Message</);
  assert.doesNotMatch(markup, />Enter sends to #help</);
});

test('channel headers hide the overflow trigger when no secondary actions are available', () => {
  const markup = renderChatPane([]);

  assert.doesNotMatch(markup, /aria-label="More actions"/);
});

test('connected channel headers keep only the title and topic context', () => {
  const markup = renderChatPane([], {
    channelUsers: [
      { nick: 'Alice', mode: 'op', away: false },
      { nick: 'Bob', mode: 'normal', away: false },
    ],
  });

  assert.match(markup, />Topic</);
  assert.match(markup, />Help channel</);
  assert.doesNotMatch(markup, />State</);
  assert.doesNotMatch(markup, />Nick</);
  assert.doesNotMatch(markup, />Unread</);
  assert.doesNotMatch(markup, />Mentions</);
  assert.doesNotMatch(markup, /<p class="max-w-xl truncate text-\[12px\] uppercase tracking-\[0\.12em\] text-muted-foreground">sofia @ irc\.example\.test<\/p>/);
});

test('channel topics render links in a dedicated wrapped row', () => {
  const markup = renderChatPane([], {
    topic: 'Rules at https://example.test/rules and idle in #lounge',
  });

  assert.match(markup, /href="https:\/\/example\.test\/rules"/);
  assert.match(markup, />#lounge</);
});

test('server headers omit the old metadata row', () => {
  const markup = renderServerPane([]);

  assert.doesNotMatch(markup, />State</);
  assert.doesNotMatch(markup, />Host</);
  assert.doesNotMatch(markup, />irc\.example\.test</);
});

test('server composers render command mode cues instead of a generic send box', () => {
  const markup = renderServerPane([]);

  assert.match(markup, />\/</);
  assert.match(markup, />Run</);
  assert.doesNotMatch(markup, />Command</);
  assert.doesNotMatch(markup, />Enter runs on Cuff-Link</);
});

test('query headers keep add friend visible instead of hiding it in overflow', () => {
  const markup = renderQueryPane([]);

  assert.match(markup, /aria-label="Close MissD"/);
  assert.doesNotMatch(markup, />Close</);
  assert.match(markup, />Enable Notifications</);
  assert.match(markup, />Add friend</);
  assert.doesNotMatch(markup, /aria-label="More actions"/);
});

test('query headers show when notifications are already enabled for the active PM', () => {
  const markup = renderQueryPane([], {
    queryNotificationsEnabled: true,
  });

  assert.match(markup, />Disable Notifications</);
});

test('muted query headers hide notification actions and show the muted banner', () => {
  const markup = renderQueryPane([], {
    selectedQueryMuted: true,
    mutedQueryNick: 'MissD',
  });

  assert.match(markup, />Unmute</);
  assert.doesNotMatch(markup, /Enable Notifications/);
  assert.doesNotMatch(markup, /Disable Notifications/);
  assert.match(markup, />Muted</);
  assert.match(markup, /Messages from MissD are hidden here and won’t create unread or notification activity\./);
});

test('reconnecting channels rely on the inline status banner instead of header metadata', () => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer();
  const selectedChannel = makeChannel({
    id: selectedBuffer.id,
    networkId: selectedBuffer.networkId,
    name: selectedBuffer.target,
  });
  const markup = renderToStaticMarkup(
    <ChatPane
      workspace={{
        mode: 'channel-connecting',
        selection: { kind: 'buffer', bufferId: selectedBuffer.id },
        connectionInstances: [network],
        selectedNetwork: network,
        selectedRuntime: {
          phase: 'connecting',
          serverName: 'irc.example.test',
          nick: network.nick,
        },
        selectedBuffer,
        selectedChannel,
        selectedPendingChannel: null,
        headerTitle: selectedChannel.name,
        headerSubtitle: 'Reconnecting. History stays available until the connection returns.',
        composerMode: 'hidden',
        composerPlaceholder: '',
        emptyBody: 'No history yet.',
        showNicklist: false,
      }}
      friends={[] satisfies FriendState[]}
      selectedMessages={[]}
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

  assert.match(markup, /Reconnecting\. History stays available until the connection returns\./);
  assert.doesNotMatch(markup, />Connecting</);
  assert.doesNotMatch(markup, />Host</);
});
