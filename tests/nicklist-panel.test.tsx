import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelState, ChannelUserState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { NicklistPanel } from '../web/src/NicklistPanel.js';
import { buildNicklistGroups } from '../web/src/nicklist-groups.js';

const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
): ChannelUserState => ({
  nick,
  mode,
  away,
});

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

test('nicklist groups users by privilege level', () => {
  const channel: ChannelState = {
    id: 'channel-1',
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [
      makeUser('zoe'),
      makeUser('alice', 'op', true),
      makeUser('bob', 'voice'),
      makeUser('owner', 'owner'),
    ],
  };

  const markup = renderToStaticMarkup(
    <NicklistPanel
      network={network}
      channel={channel}
      friends={[] satisfies FriendState[]}
      mutedNicks={[]}
      backgroundDmAudio={{ contacts: [] }}
      onAddFriend={async () => true}
      onAddNotificationContact={() => undefined}
      onAddMutedNick={async () => true}
      onRemoveFriend={async () => true}
      onRemoveNotificationContact={() => undefined}
      onRemoveMutedNick={async () => true}
      onSelectNick={() => undefined}
    />
  );

  const ownersIndex = markup.indexOf('Owners');
  const operatorsIndex = markup.indexOf('Operators');
  const voicedIndex = markup.indexOf('Voiced');
  const usersIndex = markup.lastIndexOf('Users');

  assert.ok(ownersIndex !== -1);
  assert.ok(operatorsIndex !== -1);
  assert.ok(voicedIndex !== -1);
  assert.ok(usersIndex !== -1);
  assert.ok(ownersIndex < operatorsIndex);
  assert.ok(operatorsIndex < voicedIndex);
  assert.ok(voicedIndex < usersIndex);
  assert.ok(markup.includes('owner'));
  assert.ok(markup.includes('alice'));
  assert.ok(markup.includes('bob'));
  assert.ok(markup.includes('zoe'));
  assert.match(markup, /placeholder="Filter users"/);
  assert.match(markup, /class="truncate text-rose-300">owner</);
  assert.match(markup, /class="truncate text-amber-300">alice</);
  assert.match(markup, /class="truncate text-emerald-300">bob</);
  assert.match(markup, /class="truncate text-inherit">zoe</);
  assert.match(markup, /aria-label="Away"/);
});

test('nicklist renders one-click contact controls beside away users', () => {
  const channel: ChannelState = {
    id: 'channel-1',
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('alice', 'normal', true)],
  };

  const markup = renderToStaticMarkup(
    <NicklistPanel
      network={network}
      channel={channel}
      friends={[{ id: 'friend-1', nick: 'alice' }] satisfies FriendState[]}
      mutedNicks={[]}
      backgroundDmAudio={{ contacts: [{ networkId: network.id, nick: 'alice' }] }}
      onAddFriend={async () => true}
      onAddNotificationContact={() => undefined}
      onAddMutedNick={async () => true}
      onRemoveFriend={async () => true}
      onRemoveNotificationContact={() => undefined}
      onRemoveMutedNick={async () => true}
      onSelectNick={() => undefined}
    />
  );

  assert.match(markup, /aria-label="Away"/);
  assert.match(markup, /aria-label="Remove alice from watchlist"/);
  assert.match(markup, /aria-label="Disable notifications for alice"/);
  assert.match(markup, /aria-label="Mute alice"/);
  assert.doesNotMatch(markup, /aria-label="Contact settings for alice"/);
  assert.match(markup, /aria-label="Away"[\s\S]*aria-label="Mute alice"/);
});

test('nicklist shows the unmute control for muted users', () => {
  const channel: ChannelState = {
    id: 'channel-1',
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('alice')],
  };

  const markup = renderToStaticMarkup(
    <NicklistPanel
      network={network}
      channel={channel}
      friends={[] satisfies FriendState[]}
      mutedNicks={[{ id: 'mute-1', networkId: network.id, nick: 'Alice' }]}
      backgroundDmAudio={{ contacts: [] }}
      onAddFriend={async () => true}
      onAddNotificationContact={() => undefined}
      onAddMutedNick={async () => true}
      onRemoveFriend={async () => true}
      onRemoveNotificationContact={() => undefined}
      onRemoveMutedNick={async () => true}
      onSelectNick={() => undefined}
    />
  );

  assert.match(markup, /aria-label="Add alice to watchlist"/);
  assert.match(markup, /aria-label="Enable notifications for alice"/);
  assert.match(markup, /aria-label="Unmute alice"/);
  assert.doesNotMatch(markup, /aria-label="Contact settings for alice"/);
});

test('nicklist filtering promotes exact matches and friends before broader matches', () => {
  const groups = buildNicklistGroups(
    [
      makeUser('ann'),
      makeUser('anna'),
      makeUser('annette'),
      makeUser('joann'),
    ],
    [{ id: 'friend-1', nick: 'anna' }] satisfies FriendState[],
    'ANN',
  );

  assert.deepEqual(groups.map((group) => group.label), ['Users']);
  assert.deepEqual(groups[0]?.users.map((user) => user.nick), ['ann', 'anna', 'annette', 'joann']);
});

test('nicklist filtering keeps privilege groups intact while narrowing results', () => {
  const groups = buildNicklistGroups(
    [
      makeUser('ann', 'op'),
      makeUser('anna'),
      makeUser('zoe', 'voice'),
    ],
    [] satisfies FriendState[],
    'ann',
  );

  assert.deepEqual(groups.map((group) => group.label), ['Operators', 'Users']);
  assert.deepEqual(groups[0]?.users.map((user) => user.nick), ['ann']);
  assert.deepEqual(groups[1]?.users.map((user) => user.nick), ['anna']);
});
