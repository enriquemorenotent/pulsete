import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelState, ChannelUserState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { NicklistPanel } from '../web/src/NicklistPanel.js';

const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
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
      makeUser('alice', 'op'),
      makeUser('bob', 'voice'),
      makeUser('owner', 'owner'),
    ],
  };

  const markup = renderToStaticMarkup(
    <NicklistPanel
      network={network}
      channel={channel}
      friends={[] satisfies FriendState[]}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
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
  assert.match(markup, /class="truncate text-rose-300">owner</);
  assert.match(markup, /class="truncate text-amber-300">alice</);
  assert.match(markup, /class="truncate text-emerald-300">bob</);
  assert.match(markup, /class="truncate text-inherit">zoe</);
});
