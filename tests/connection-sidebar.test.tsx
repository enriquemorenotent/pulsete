import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionSidebar } from '../web/src/ConnectionSidebar.js';
import type {
  BufferState,
  FriendState,
  NetworkProfile,
} from '../shared/protocol.js';
import { buildConnectionSidebarView } from '../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import type { NetworkRuntimeState } from '../web/src/workspace.js';

const makeNetwork = (
  overrides: Partial<NetworkProfile> = {},
): NetworkProfile => ({
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
  assert.match(markup, />as sofia</);
  assert.match(markup, /bg-emerald-400/);
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
  assert.match(markup, />as sofia</);
  assert.match(markup, /bg-amber-300/);
});

test('friend rows expose online and away cues when the rail defaults open', () => {
  const friend: FriendState = { id: 'friend-1', nick: 'Alice' };
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [] satisfies NetworkProfile[],
        conversation: buildConversationIndex({
          buffers: [] satisfies BufferState[],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: {},
        selection: null,
      })}
      friends={[friend]}
      friendPresence={{ [friend.id]: 'away' }}
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

  assert.match(markup, /Friends<\/h2>/);
  assert.doesNotMatch(markup, />1 online</);
  assert.match(markup, /aria-label="Open Alice \(away\)"/);
  assert.match(markup, /bg-yellow-400/);
});

test('friends sort online contacts above away, then offline', () => {
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [] satisfies NetworkProfile[],
        conversation: buildConversationIndex({
          buffers: [] satisfies BufferState[],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: {},
        selection: null,
      })}
      friends={[
        { id: 'friend-2', nick: 'Mira' },
        { id: 'friend-1', nick: 'Alice' },
        { id: 'friend-3', nick: 'Bea' },
      ]}
      friendPresence={{
        'friend-1': 'offline',
        'friend-2': 'online',
        'friend-3': 'away',
      }}
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

  const miraIndex = markup.indexOf('aria-label="Open Mira (online)"');
  const beaIndex = markup.indexOf('aria-label="Open Bea (away)"');
  const aliceIndex = markup.indexOf('aria-label="Open Alice (offline)"');

  assert.notEqual(miraIndex, -1);
  assert.notEqual(beaIndex, -1);
  assert.notEqual(aliceIndex, -1);
  assert.ok(miraIndex < beaIndex);
  assert.ok(beaIndex < aliceIndex);
});

test('friends header shows only the section label', () => {
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [] satisfies NetworkProfile[],
        conversation: buildConversationIndex({
          buffers: [] satisfies BufferState[],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: {},
        selection: null,
      })}
      friends={[
        { id: 'friend-1', nick: 'Alice' },
        { id: 'friend-2', nick: 'Bob' },
      ]}
      friendPresence={{}}
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

  assert.match(markup, /Friends<\/h2>/);
  assert.doesNotMatch(markup, /Friends<\/h2><span/);
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
      /bg-white\/\[0\.05\] ring-1 ring-inset ring-white\/\[0\.08\]/g,
    ) ?? [];
  assert.equal(selectedRows.length, 1);
  assert.match(markup, /aria-label="Open pending #Help"/);
});

test('priority unread buffers render the stronger activity badge styling', () => {
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

  assert.match(markup, /bg-primary\/14 text-primary/);
  assert.match(markup, />3</);
});

test('open query buffers show saved contact presence cues', () => {
  const network = makeNetwork();
  const offlineQuery = makeBuffer({
    id: 'query-1',
    kind: 'query',
    target: 'alice',
  });
  const awayQuery = makeBuffer({
    id: 'query-2',
    kind: 'query',
    target: 'bob',
  });
  const onlineQuery = makeBuffer({
    id: 'query-3',
    kind: 'query',
    target: 'carol',
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [
            makeBuffer({ id: 'server-1' }),
            offlineQuery,
            awayQuery,
            onlineQuery,
          ],
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
      queryPresence={{
        [offlineQuery.id]: 'offline',
        [awayQuery.id]: 'away',
        [onlineQuery.id]: 'online',
      }}
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

  assert.match(markup, /aria-label="Open alice \(offline\)"/);
  assert.match(markup, /aria-label="Open bob \(away\)"/);
  assert.match(markup, /aria-label="Open carol \(online\)"/);
  assert.match(markup, /bg-red-400/);
  assert.match(markup, /bg-yellow-400/);
  assert.match(markup, /bg-emerald-400/);
  assert.match(markup, /text-red-400/);
  assert.match(markup, /text-yellow-400/);
  assert.match(markup, /text-emerald-400/);
});

test('connected query buffers show a gray badge while presence is resolving', () => {
  const network = makeNetwork();
  const pendingQuery = makeBuffer({
    id: 'query-pending',
    kind: 'query',
    target: 'alice',
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), pendingQuery],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      queryPresence={{}}
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

  assert.match(markup, /aria-label="Open alice \(checking status\)"/);
  assert.match(markup, /bg-zinc-400/);
  assert.match(markup, /text-zinc-400/);
});

test('offline query buffers do not show a gray pending badge', () => {
  const network = makeNetwork();
  const pendingQuery = makeBuffer({
    id: 'query-pending',
    kind: 'query',
    target: 'alice',
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), pendingQuery],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'offline' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      queryPresence={{}}
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

  assert.match(markup, /aria-label="Open alice"/);
  assert.doesNotMatch(markup, /bg-zinc-400/);
});
