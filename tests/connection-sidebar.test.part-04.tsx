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
  personaNote: overrides.personaNote ?? '',
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
  assert.match(markup, /text-red-400/);
  assert.match(markup, /text-yellow-400/);
  assert.match(markup, /text-emerald-400/);
  assert.doesNotMatch(markup, /aria-label="Unread messages"/);
});

test('query rows use the overlaid dot for unread state instead of a trailing marker', () => {
  const network = makeNetwork();
  const unreadQuery = makeBuffer({
    id: 'query-1',
    kind: 'query',
    target: 'alice',
    unread: 2,
    priorityUnread: 1,
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), unreadQuery],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      queryPresence={{ [unreadQuery.id]: 'online' }}
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

  assert.match(markup, /aria-label="Open alice \(online, unread\)"/);
  assert.match(markup, /text-emerald-400/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[13px\] text-foreground font-semibold">alice<\/span>/,
  );
  assert.doesNotMatch(markup, /aria-label="Unread messages requiring attention"/);
});

test('query rows use the same blue overlaid dot for non-priority unread state', () => {
  const network = makeNetwork();
  const unreadQuery = makeBuffer({
    id: 'query-1',
    kind: 'query',
    target: 'alice',
    unread: 2,
    priorityUnread: 0,
  });
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: [network],
        conversation: buildConversationIndex({
          buffers: [makeBuffer({ id: 'server-1' }), unreadQuery],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: { [network.id]: makeRuntime({ phase: 'connected' }) },
        selection: { kind: 'buffer', bufferId: 'server-1' },
      })}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      queryPresence={{ [unreadQuery.id]: 'away' }}
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

  assert.match(markup, /aria-label="Open alice \(away, unread\)"/);
  assert.match(markup, /text-yellow-400/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[13px\] text-foreground font-medium">alice<\/span>/,
  );
  assert.doesNotMatch(markup, /aria-label="Unread messages"/);
});

