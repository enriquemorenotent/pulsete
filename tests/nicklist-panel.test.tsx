import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChannelState, ChannelUserState, NetworkProfile } from '../shared/protocol-chat.js';
import { NicklistPanel } from '../web/src/NicklistPanel.js';
import { buildNicklistGroups } from '../web/src/nicklist-groups.js';
import { noopContactRuleHandlers } from './chat-pane.test.renderers.js';

const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
  details: Partial<Pick<ChannelUserState, 'host' | 'username'>> = {},
): ChannelUserState => ({
  nick,
  mode,
  away,
  ...details,
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
  realName: 'Tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

type NicklistRenderOptions = Partial<Pick<
  Parameters<typeof NicklistPanel>[0],
  'contactNotificationSettings'
  | 'externalAvatarsEnabled'
  | 'friends'
  | 'mutedNicks'
  | 'nickEmojis'
>>;

const makeChannel = (users: ChannelUserState[]): ChannelState => ({
  id: 'channel-1',
  networkId: network.id,
  name: '#help',
  topic: '',
  users,
});

const renderNicklist = (
  channel: ChannelState,
  options: NicklistRenderOptions = {},
) => renderToStaticMarkup(
  <NicklistPanel
    network={network}
    channel={channel}
    friends={options.friends ?? []}
    nickEmojis={options.nickEmojis ?? []}
    mutedNicks={options.mutedNicks ?? []}
    contactNotificationSettings={options.contactNotificationSettings ?? { contacts: [] }}
    contactRuleHandlers={noopContactRuleHandlers}
    externalAvatarsEnabled={options.externalAvatarsEnabled ?? false}
    onSaveNickEmoji={async () => true}
    onSelectNick={() => undefined}
  />
);

test('nicklist groups users by privilege level', () => {
  const channel = makeChannel([
    makeUser('zoe'),
    makeUser('alice', 'op', true),
    makeUser('bob', 'voice'),
    makeUser('owner', 'owner'),
  ]);
  const markup = renderNicklist(channel);

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
  assert.match(markup, /class="truncate text-fuchsia-300">zoe</);
  assert.match(markup, /aria-label="Away"/);
});

test('nicklist renders one-click contact controls beside away users', () => {
  const channel = makeChannel([makeUser('alice', 'normal', true)]);
  const markup = renderNicklist(channel, {
    friends: [{ id: 'friend-1', nick: 'alice' }],
    nickEmojis: [{ id: 'nick-emoji-1', networkId: network.id, nick: 'alice', emoji: '🌙' }],
    contactNotificationSettings: { contacts: [{ networkId: network.id, nick: 'alice' }] },
  });

  assert.match(markup, /aria-label="Away"/);
  assert.match(
    markup,
    /<span class="truncate text-fuchsia-300">alice<\/span><span aria-hidden="true" class="shrink-0 leading-none">🌙<\/span>/,
  );
  assert.match(markup, /aria-label="Remove alice from watchlist"/);
  assert.match(markup, /aria-label="Disable notifications for alice"/);
  assert.match(markup, /aria-label="Mute alice"/);
  assert.doesNotMatch(markup, /aria-label="Contact settings for alice"/);
  assert.match(markup, /aria-label="Away"[\s\S]*aria-label="Mute alice"/);
});

test('nicklist shows the unmute control for muted users', () => {
  const channel = makeChannel([makeUser('alice')]);
  const markup = renderNicklist(channel, {
    mutedNicks: [{ id: 'mute-1', networkId: network.id, nick: 'Alice' }],
    contactNotificationSettings: { contacts: [{ networkId: network.id, nick: 'alice' }] },
  });

  assert.match(markup, /aria-label="Add alice to watchlist"/);
  assert.match(markup, /aria-label="Enable notifications for alice"/);
  assert.match(markup, /aria-label="Unmute alice"/);
  assert.doesNotMatch(markup, /aria-label="Contact settings for alice"/);
});

test('nicklist renders IRCCloud avatars only when external avatars are enabled', () => {
  const channel = makeChannel([
    makeUser('alice', 'normal', false, { username: 'uid7' }),
  ]);
  const disabledMarkup = renderNicklist(channel);
  const enabledMarkup = renderNicklist(channel, { externalAvatarsEnabled: true });

  assert.doesNotMatch(disabledMarkup, /avatar-redirect/);
  assert.match(enabledMarkup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
});

test('nicklist reserves avatar slots for users without IRCCloud avatar identity', () => {
  const channel = makeChannel([makeUser('Brute')]);
  const disabledMarkup = renderNicklist(channel);
  const enabledMarkup = renderNicklist(channel, { externalAvatarsEnabled: true });

  assert.doesNotMatch(disabledMarkup, /font-medium leading-none">B</);
  assert.match(enabledMarkup, /font-medium leading-none">B</);
  assert.doesNotMatch(enabledMarkup, /avatar-redirect/);
});

test('nicklist filtering promotes exact matches and friends before broader matches', () => {
  const groups = buildNicklistGroups(
    [
      makeUser('ann'),
      makeUser('anna'),
      makeUser('annette'),
      makeUser('joann'),
    ],
    [{ id: 'friend-1', nick: 'anna' }],
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
    [],
    'ann',
  );

  assert.deepEqual(groups.map((group) => group.label), ['Operators', 'Users']);
  assert.deepEqual(groups[0]?.users.map((user) => user.nick), ['ann']);
  assert.deepEqual(groups[1]?.users.map((user) => user.nick), ['anna']);
});
