import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionSidebar } from '../web/src/ConnectionSidebar.js';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { buildConnectionSidebarView } from '../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import type { NetworkRuntimeState } from '../web/src/workspace.js';

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
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makeRuntime = (overrides: Partial<NetworkRuntimeState> = {}): NetworkRuntimeState => ({
  phase: overrides.phase ?? 'offline',
  serverName: overrides.serverName ?? null,
  nick: overrides.nick ?? 'sofia',
});

test('offline connections keep channel and query rows visible and selectable', () => {
  const network = makeNetwork();
  const channel = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
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
    />
  );

  assert.match(markup, /aria-label="Open #help"/);
  assert.match(markup, /aria-label="Open alice"/);
  assert.doesNotMatch(markup, /aria-label="Open #help"[^>]*disabled/);
  assert.doesNotMatch(markup, /aria-label="Open alice"[^>]*disabled/);
});

test('friend rows expose online and offline cues', () => {
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
      friendPresence={{ [friend.id]: true }}
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
    />
  );

  assert.match(markup, /Friends \(1\)/);
  assert.match(markup, /aria-label="Open Alice \(online\)"/);
  assert.match(markup, /bg-emerald-400/);
});

test('friends header shows the total registered friends count', () => {
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
    />
  );

  assert.match(markup, /Friends \(2\)/);
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
        selection: { kind: 'pending-channel', networkId: network.id, channel: '#help' },
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
    />
  );

  const selectedRows = markup.match(/rounded-sm bg-accent/g) ?? [];
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
    />
  );

  assert.match(markup, /bg-primary\/10 text-primary/);
  assert.match(markup, />3</);
});
