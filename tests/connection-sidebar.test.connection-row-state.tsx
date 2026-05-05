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

test('offline connections keep channel and query rows visible and selectable', () => {
  const network = makeNetwork();
  const channel = makeBuffer({
    id: 'channel-1',
    kind: 'channel',
    target: '#help',
  });
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'alice' });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), channel, query],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'offline' }) },
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

  assert.match(markup, /aria-label="Open #help"/);
  assert.match(markup, /aria-label="Open alice"/);
  assert.match(markup, /Connections<\/h2>/);
  assert.doesNotMatch(markup, /Buffers<\/h2>/);
  assert.doesNotMatch(markup, /aria-label="Open #help"[^>]*disabled/);
  assert.doesNotMatch(markup, /aria-label="Open alice"[^>]*disabled/);
  assert.doesNotMatch(markup, />Offline</);
});

test('connected rows rely on the status dot instead of repeating a connected label', () => {
  const network = makeNetwork();
  const server = makeBuffer({ id: 'server-1' });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [server],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: server.id },
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

  assert.doesNotMatch(markup, />Connected</);
  assert.doesNotMatch(markup, />as sofia</);
  assert.match(markup, /text-emerald-400/);
  assert.match(
    markup,
    /class="truncate text-\[12\.5px\] text-foreground font-semibold">Cuff-Link<\/span>/,
  );
});

test('connecting rows rely on the status dot instead of repeating a connecting label', () => {
  const network = makeNetwork();
  const server = makeBuffer({ id: 'server-1' });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [server],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connecting' }) },
        selection: { kind: 'buffer', bufferId: server.id },
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

  assert.doesNotMatch(markup, />Connecting</);
  assert.doesNotMatch(markup, />as sofia</);
  assert.match(markup, /text-amber-300/);
});

test('server rows use the overlaid dot for unread state instead of a trailing marker', () => {
  const network = makeNetwork();
  const server = makeBuffer({
    id: 'server-1',
    unread: 2,
    priorityUnread: 1,
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [server],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: server.id },
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

  assert.match(markup, /aria-label="Open Cuff-Link \(unread\)"/);
  assert.match(markup, /text-emerald-400/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[12\.5px\] text-foreground font-semibold">Cuff-Link<\/span>/,
  );
  assert.doesNotMatch(markup, /aria-label="Unread messages requiring attention"/);
});
