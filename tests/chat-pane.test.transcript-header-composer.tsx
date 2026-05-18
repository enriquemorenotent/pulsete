import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeBuffer, makeChannel, makeMessage, makeNetwork, makeWorkspace } from './chat-pane.test.fixtures.js';
import { noopContactRuleHandlers, renderChatPane, renderQueryPane, renderServerPane } from './chat-pane.test.renderers.js';

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
      nickEmojis={[]}
      externalAvatarsEnabled={false}
      mutedNicks={[]}
      selectedMessages={messages}
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

  assert.match(markup, /New messages/);
  assert.match(markup, /31 December 1999/);
  assert.match(markup, /1 January 2000[\s\S]*New messages[\s\S]*newer/);
  assert.match(markup, /older/);
  assert.match(markup, /newer/);
});

test('channel headers collapse maintenance actions behind a compact overflow trigger', () => {
  const markup = renderChatPane([], {
    showChannelAutoJoin: true,
    channelAutoJoinActive: true,
  });

  assert.match(markup, /aria-label="More actions"/);
  assert.match(markup, />Close</);
  assert.doesNotMatch(markup, /Autojoin On/);
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

  assert.match(markup, />Help channel</);
  assert.match(markup, /border-l-2 border-primary\/55/);
  assert.doesNotMatch(markup, />Topic</);
  assert.doesNotMatch(markup, />State</);
  assert.doesNotMatch(markup, />Nick</);
  assert.doesNotMatch(markup, />Unread</);
  assert.doesNotMatch(markup, />Mentions</);
  assert.doesNotMatch(markup, /<p class="max-w-xl truncate text-\[12px\] uppercase tracking-\[0\.12em\] text-muted-foreground">sofia @ irc\.example\.test<\/p>/);
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

test('query headers expose one-click contact controls', () => {
  const markup = renderQueryPane([]);

  assert.match(markup, /aria-label="Close MissD"/);
  assert.doesNotMatch(markup, />Close</);
  assert.match(markup, /aria-label="Add MissD to watchlist"/);
  assert.match(markup, /aria-label="Enable notifications for MissD"/);
  assert.match(markup, /aria-label="Mute MissD"/);
  assert.doesNotMatch(markup, /aria-label="Edit emoji tag for MissD"/);
  assert.doesNotMatch(markup, /aria-label="Contact settings for MissD"/);
  assert.doesNotMatch(markup, /aria-label="More actions"/);
});

test('query headers render IRCCloud avatars when external avatars are enabled', () => {
  const markup = renderQueryPane([], {
    externalAvatarsEnabled: true,
    selectedQueryAvatarUser: {
      nick: 'MissD',
      mode: 'normal',
      away: false,
      username: 'uid7',
      host: null,
    },
  });

  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /aria-label="Avatar for MissD"/);
  assert.match(markup, /gap-4/);
  assert.match(markup, /min-h-\[68px\] items-center py-0 pl-0 pr-4/);
  assert.match(markup, /size-\[68px\] text-lg rounded-none/);
  assert.match(markup, /cursor-zoom-in/);
});

test('query headers render persisted PM IRCCloud avatars without channel presence', () => {
  const markup = renderQueryPane([], {
    externalAvatarsEnabled: true,
    selectedQueryAvatarUser: {
      nick: 'MissD',
      mode: 'normal',
      away: false,
      username: null,
      host: null,
      ircCloudAvatarId: '7',
    },
  });

  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /aria-label="Avatar for MissD"/);
});

test('query headers render avatar placeholders when no IRCCloud avatar is available', () => {
  const markup = renderQueryPane([], {
    externalAvatarsEnabled: true,
    selectedQueryAvatarUser: {
      nick: 'MissD',
      mode: 'normal',
      away: false,
      username: null,
      host: null,
    },
  });

  assert.match(markup, /font-medium leading-none">M</);
  assert.doesNotMatch(markup, /avatar-redirect/);
  assert.doesNotMatch(markup, /cursor-zoom-in/);
});

test('query headers expose the active notification toggle state', () => {
  const markup = renderQueryPane([], {
    queryNotificationsEnabled: true,
  });

  assert.match(markup, /aria-label="Disable notifications for MissD"/);
  assert.doesNotMatch(markup, /aria-label="Enable notifications for MissD"/);
});

test('muted query headers expose unmute and show the muted banner', () => {
  const markup = renderQueryPane([], {
    selectedQueryMuted: true,
    mutedQueryNick: 'MissD',
  });

  assert.match(markup, /aria-label="Unmute MissD"/);
  assert.match(markup, /aria-label="Enable notifications for MissD"/);
  assert.match(markup, />Muted</);
  assert.match(markup, /Messages from MissD are collapsed here and won’t create unread or notification activity\./);
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
        workspaceNetworks: [network],
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
        headerSubtitle: 'Reconnecting. History remains available.',
        composerMode: 'normal',
        composerDisabled: true,
        composerPlaceholder: 'Message #help or /command',
        emptyBody: 'No history yet.',
        showNicklist: false,
      }}
      nickEmojis={[]}
      externalAvatarsEnabled={false}
      mutedNicks={[]}
      selectedMessages={[]}
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

  assert.match(markup, /History stays available while the connection returns\./);
  assert.match(markup, /placeholder="Message #help/);
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.doesNotMatch(markup, />Connecting</);
  assert.doesNotMatch(markup, />Host</);
});
