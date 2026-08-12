import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeBuffer, makeChannel, makeNetwork } from './chat-pane.test.fixtures.js';
import { noopContactRuleHandlers, renderQueryPane } from './chat-pane.test.renderers.js';

test('offline channels surface an inline reconnect action', () => {
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
        mode: 'channel-offline',
        selection: { kind: 'buffer', bufferId: selectedBuffer.id },
        workspaceNetworks: [network],
        selectedNetwork: network,
        selectedRuntime: {
          phase: 'offline',
          serverName: 'irc.example.test',
          nick: network.nick,
        },
        selectedBuffer,
        selectedChannel,
        selectedPendingChannel: null,
        headerTitle: selectedChannel.name,
        headerSubtitle: 'Offline. History remains available.',
        composerMode: 'normal',
        composerDisabled: true,
        composerPlaceholder: 'Message #help or /command',
        emptyBody: 'No history yet.',
        showNicklist: false,
      }}
      nickEmojis={[]}
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
      onReconnectNetwork={async () => true}
    />
  );

  assert.match(
    markup,
    /History stays available until you reconnect\./,
  );
  assert.match(markup, />Reconnect</);
  assert.match(markup, /role="status"/);
  assert.match(markup, /border-b py-1.5/);
  assert.match(markup, /placeholder="Message #help/);
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.match(markup, /<button[^>]*disabled=""/);
});

test('offline private messages keep a disabled composer in place', () => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer({ kind: 'query', target: 'MissD' });
  const markup = renderToStaticMarkup(
    <ChatPane
      workspace={{
        mode: 'query-offline',
        selection: { kind: 'buffer', bufferId: selectedBuffer.id },
        workspaceNetworks: [network],
        selectedNetwork: network,
        selectedRuntime: {
          phase: 'offline',
          serverName: 'irc.example.test',
          nick: network.nick,
        },
        selectedBuffer,
        selectedChannel: null,
        selectedPendingChannel: null,
        headerTitle: selectedBuffer.target,
        headerSubtitle: 'Offline. History remains available.',
        composerMode: 'normal',
        composerDisabled: true,
        composerPlaceholder: 'Message MissD or /command',
        emptyBody: 'No history yet.',
        showNicklist: false,
      }}
      nickEmojis={[]}
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
      onReconnectNetwork={async () => true}
    />
  );

  assert.match(markup, /placeholder="Message MissD/);
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.match(markup, /<button[^>]*disabled=""/);
});

test('saved channels that are no longer joined surface a rejoin action', () => {
  const network = makeNetwork();
  const selectedBuffer = makeBuffer();
  const markup = renderToStaticMarkup(
    <ChatPane
      workspace={{
        mode: 'channel-offline',
        selection: { kind: 'buffer', bufferId: selectedBuffer.id },
        workspaceNetworks: [network],
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
        headerSubtitle: 'Not joined. History stays available until you rejoin this channel.',
        composerMode: 'hidden',
        composerPlaceholder: '',
        emptyBody: 'Use /join to re-enter this channel before sending messages.',
        showNicklist: false,
      }}
      nickEmojis={[]}
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

  assert.match(markup, /You&#x27;re not in #help\. Rejoin to send messages again\./);
  assert.match(markup, />Rejoin #help</);
});

test('connected query headers stay free of metadata chrome', () => {
  const markup = renderQueryPane([]);

  assert.doesNotMatch(markup, />State</);
  assert.doesNotMatch(markup, />Host</);
  assert.doesNotMatch(markup, />Nick</);
  assert.doesNotMatch(markup, />Unread</);
  assert.doesNotMatch(markup, />Mentions</);
  assert.doesNotMatch(markup, />Topic</);
});
