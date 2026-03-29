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

test('server rows use medium weight for non-priority unread state', () => {
  const network = makeNetwork();
  const server = makeBuffer({
    id: 'server-1',
    unread: 2,
    priorityUnread: 0,
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
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[13px\] text-foreground font-medium">Cuff-Link<\/span>/,
  );
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

