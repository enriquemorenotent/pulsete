import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionSidebar } from '../web/src/ConnectionSidebar.js';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol-chat.js';
import { buildConnectionSidebarView } from '../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import type { NetworkRuntimeState } from '../web/src/workspace.js';

const makeNetwork = (
  overrides: Partial<NetworkProfile> = {},
): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makeRuntime = (
  overrides: Partial<NetworkRuntimeState> = {},
): NetworkRuntimeState => ({
  phase: overrides.phase ?? 'offline',
  serverName: overrides.serverName ?? null,
  nick: overrides.nick ?? 'sofia',
});

test('friends stay visible when live connections are present', () => {
  const network = makeNetwork();
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' })],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[
        { id: 'friend-1', nick: 'Alice' },
        { id: 'friend-2', nick: 'Bob' },
      ]}
      friendPresence={{}}
      nickEmojis={[]}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onSelectFriend={async () => undefined}
      onSelectNetwork={() => undefined}
      onSelectBuffer={() => undefined}
      onSelectPendingChannel={() => undefined}
      onReconnectNetwork={() => undefined}
      onDisconnectNetwork={() => undefined}
      onCloseConnection={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
    />,
  );

  assert.doesNotMatch(markup, />0 online</);
  assert.match(markup, /aria-label="Open Alice \(offline\)"/);
  assert.match(markup, /aria-label="Open Bob \(offline\)"/);
});

test('pending channel selection ignores IRC casing in the sidebar', () => {
  const network = makeNetwork();
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' })],
          channels: [],
          pendingChannels: [{ networkId: network.id, channel: '#Help' }],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: {
          kind: 'pending-channel',
          networkId: network.id,
          channel: '#help',
        },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      nickEmojis={[]}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onSelectFriend={async () => undefined}
      onSelectNetwork={() => undefined}
      onSelectBuffer={() => undefined}
      onSelectPendingChannel={() => undefined}
      onReconnectNetwork={() => undefined}
      onDisconnectNetwork={() => undefined}
      onCloseConnection={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
    />,
  );

  const selectedRows =
    markup.match(
      /border-primary\/35 border-l-primary bg-primary\/\[0\.13\] ring-1 ring-inset ring-primary\/25/g,
    ) ?? [];
  assert.equal(selectedRows.length, 1);
  assert.match(markup, /aria-label="Open pending #Help"/);
});

test('priority unread buffers render a stronger unread marker instead of a count badge', () => {
  const network = makeNetwork();
  const channel = makeBuffer({
    id: 'channel-1',
    kind: 'channel',
    target: '#help',
    unread: 3,
    priorityUnread: 1,
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), channel],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      nickEmojis={[]}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onSelectFriend={async () => undefined}
      onSelectNetwork={() => undefined}
      onSelectBuffer={() => undefined}
      onSelectPendingChannel={() => undefined}
      onReconnectNetwork={() => undefined}
      onDisconnectNetwork={() => undefined}
      onCloseConnection={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Open #help \(unread\)"/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[12px\] text-foreground font-semibold">#help<\/span>/,
  );
  assert.doesNotMatch(markup, /aria-label="Unread messages requiring attention"/);
  assert.doesNotMatch(markup, />3</);
});

test('non-priority unread buffers render the same blue unread marker instead of a count badge', () => {
  const network = makeNetwork();
  const channel = makeBuffer({
    id: 'channel-1',
    kind: 'channel',
    target: '#help',
    unread: 3,
    priorityUnread: 0,
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), channel],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      nickEmojis={[]}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onSelectFriend={async () => undefined}
      onSelectNetwork={() => undefined}
      onSelectBuffer={() => undefined}
      onSelectPendingChannel={() => undefined}
      onReconnectNetwork={() => undefined}
      onDisconnectNetwork={() => undefined}
      onCloseConnection={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Open #help \(unread\)"/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[12px\] text-foreground font-medium">#help<\/span>/,
  );
  assert.doesNotMatch(markup, /aria-label="Unread messages"/);
  assert.doesNotMatch(markup, />3</);
});
