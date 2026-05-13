import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChannelState } from '../shared/protocol-chat.js';
import {
  extractIrcCloudAvatarId,
  resolveIrcCloudAvatarUrl,
  resolveUserAvatarCandidate,
} from '../web/src/user-avatars/irccloud.js';
import {
  parseUserAvatarSettings,
  serializeUserAvatarSettings,
} from '../web/src/user-avatars/settings.js';

test('IRCCloud avatar resolver extracts public uid and sid identities', () => {
  assert.equal(extractIrcCloudAvatarId('uid7'), '7');
  assert.equal(extractIrcCloudAvatarId('~sid3'), '3');
  assert.equal(extractIrcCloudAvatarId('gateway/web/irccloud.com/x-uid42'), '42');
  assert.equal(extractIrcCloudAvatarId('fluid7'), null);
  assert.equal(extractIrcCloudAvatarId('userid7'), null);
  assert.equal(extractIrcCloudAvatarId('uid0'), null);
});

test('IRCCloud avatar resolver prefers username identity over host identity', () => {
  assert.equal(
    resolveIrcCloudAvatarUrl({ username: 'uid7', host: 'sid3' }),
    'https://static.irccloud-cdn.com/avatar-redirect/7',
  );
  assert.equal(
    resolveIrcCloudAvatarUrl({ username: null, host: 'gateway/web/irccloud.com/x-sid9' }),
    'https://static.irccloud-cdn.com/avatar-redirect/9',
  );
  assert.equal(resolveIrcCloudAvatarUrl({ username: 'tester', host: 'example.test' }), null);
});

test('IRCCloud avatar resolver accepts persisted avatar ids', () => {
  assert.equal(
    resolveIrcCloudAvatarUrl({ username: null, host: null, ircCloudAvatarId: '7' }),
    'https://static.irccloud-cdn.com/avatar-redirect/7',
  );
  assert.equal(resolveIrcCloudAvatarUrl({ username: null, host: null, ircCloudAvatarId: 'uid7' }), null);
});

test('query avatar lookup is network-scoped and IRC-case aware', () => {
  const channels: ChannelState[] = [
    {
      id: 'channel-1',
      networkId: 'network-1',
      name: '#help',
      topic: '',
      users: [
        { nick: 'Alice[]', mode: 'normal', away: false, username: 'uid12', host: null },
      ],
    },
    {
      id: 'channel-2',
      networkId: 'network-2',
      name: '#help',
      topic: '',
      users: [
        { nick: 'Alice{}', mode: 'normal', away: false, username: 'uid99', host: null },
      ],
    },
  ];

  const user = resolveUserAvatarCandidate(channels, 'network-1', 'alice{}');
  assert.equal(user.nick, 'Alice[]');
  assert.equal(
    resolveIrcCloudAvatarUrl(user),
    'https://static.irccloud-cdn.com/avatar-redirect/12',
  );
});

test('query avatar lookup falls back to a placeholder identity', () => {
  assert.deepEqual(resolveUserAvatarCandidate([], 'network-1', 'MissD'), {
    nick: 'MissD',
    account: null,
    username: null,
    host: null,
    identity: undefined,
  });

  const user = resolveUserAvatarCandidate([
    {
      id: 'channel-1',
      networkId: 'network-1',
      name: '#help',
      topic: '',
      users: [
        {
          nick: 'MissD',
          mode: 'normal',
          away: false,
          username: 'tester',
          host: 'example.test',
        },
      ],
    },
  ], 'network-1', 'missd');
  assert.equal(user.nick, 'MissD');
  assert.equal(resolveIrcCloudAvatarUrl(user), null);
});

test('query avatar lookup falls back to persisted PM avatar ids', () => {
  const noRosterUser = resolveUserAvatarCandidate([], 'network-1', 'MissD', '7');
  assert.deepEqual(noRosterUser, {
    nick: 'MissD',
    account: null,
    username: null,
    host: null,
    identity: undefined,
    ircCloudAvatarId: '7',
  });
  assert.equal(
    resolveIrcCloudAvatarUrl(noRosterUser),
    'https://static.irccloud-cdn.com/avatar-redirect/7',
  );

  const rosterUser = resolveUserAvatarCandidate([
    {
      id: 'channel-1',
      networkId: 'network-1',
      name: '#help',
      topic: '',
      users: [
        {
          nick: 'MissD',
          mode: 'normal',
          away: false,
          username: 'tester',
          host: 'example.test',
        },
      ],
    },
  ], 'network-1', 'missd', '9');
  assert.equal(rosterUser.nick, 'MissD');
  assert.equal(
    resolveIrcCloudAvatarUrl(rosterUser),
    'https://static.irccloud-cdn.com/avatar-redirect/9',
  );
});

test('user avatar settings are disabled by default and serialize explicitly', () => {
  assert.deepEqual(parseUserAvatarSettings(null), { externalAvatarsEnabled: false });
  assert.deepEqual(parseUserAvatarSettings('not-json'), { externalAvatarsEnabled: false });
  assert.deepEqual(
    parseUserAvatarSettings('{"externalAvatarsEnabled":true}'),
    { externalAvatarsEnabled: true },
  );
  assert.equal(
    serializeUserAvatarSettings({ externalAvatarsEnabled: true }),
    '{"externalAvatarsEnabled":true}',
  );
});
