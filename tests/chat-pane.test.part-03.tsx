import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FriendState } from '../shared/protocol.js';
import { ChatPane } from '../web/src/ChatPane.js';
import { closedChannelList, makeBuffer, makeChannel, makeNetwork } from './chat-pane.test.fixtures.js';
import { renderQueryPane } from './chat-pane.test.renderers.js';

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
        headerSubtitle: 'Offline. History only until you reconnect.',
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
      onReconnectNetwork={async () => true}
    />
  );

  assert.match(
    markup,
    /You&#x27;re offline\. History stays available until you reconnect\./,
  );
  assert.match(markup, />Reconnect</);
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
