import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionSidebar } from '../web/src/ConnectionSidebar.js';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
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
      networks={[network]}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      buffers={[makeBuffer({ id: 'server-1' }), channel, query]}
      pendingChannels={[]}
      networkStates={{ [network.id]: makeRuntime({ phase: 'offline' }) }}
      selection={{ kind: 'buffer', bufferId: 'server-1' }}
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
      networks={[] satisfies NetworkProfile[]}
      friends={[friend]}
      friendPresence={{ [friend.id]: true }}
      buffers={[] satisfies BufferState[]}
      pendingChannels={[]}
      networkStates={{}}
      selection={null}
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

  assert.match(markup, /aria-label="Open Alice \(online\)"/);
  assert.match(markup, /bg-emerald-400/);
});

test('pending channel selection ignores IRC casing in the sidebar', () => {
  const network = makeNetwork();
  const markup = renderToStaticMarkup(
    <ConnectionSidebar
      networks={[network]}
      friends={[] satisfies FriendState[]}
      friendPresence={{}}
      buffers={[makeBuffer({ id: 'server-1' })]}
      pendingChannels={[{ networkId: network.id, channel: '#Help' }]}
      networkStates={{ [network.id]: makeRuntime({ phase: 'connected' }) }}
      selection={{ kind: 'pending-channel', networkId: network.id, channel: '#help' }}
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
