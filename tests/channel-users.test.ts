import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPrimaryChannelUserMode,
  parseChannelUser,
  updateChannelUserMode,
} from '../shared/channel-users.js';
import type { ChannelUserState } from '../shared/protocol-chat.js';

const projectUserModes = (users: ChannelUserState[]) =>
  users.map(({ nick, mode, modes, away }) => ({ nick, mode, modes, away }));

test('channel user parsing stores every stacked prefix mode', () => {
  assert.deepEqual(parseChannelUser('~&@%+alice!ident@example.test'), {
    nick: 'alice',
    mode: 'owner',
    modes: ['owner', 'admin', 'op', 'halfop', 'voice'],
    away: false,
    username: 'ident',
    host: 'example.test',
    identity: { kind: 'userhost', value: 'ident@example.test' },
    account: null,
    realname: null,
  });
});

test('channel user parsing upgrades legacy primary mode users', () => {
  assert.deepEqual(parseChannelUser({
    nick: ' Alice ',
    mode: 'op',
    modes: [],
    away: true,
    account: ' alice ',
    username: ' ident ',
    host: ' example.test ',
    realname: ' Alice Example ',
  }), {
    nick: 'Alice',
    mode: 'op',
    modes: ['op'],
    away: true,
    account: 'alice',
    username: 'ident',
    host: 'example.test',
    identity: { kind: 'account', value: 'alice' },
    realname: 'Alice Example',
  });
});

test('channel user mode updates preserve remaining active modes', () => {
  const initial = [parseChannelUser('@+alice')].filter((user): user is ChannelUserState => user !== null);
  const withoutOp = updateChannelUserMode(initial, 'alice', 'op', false);
  const withHalfop = updateChannelUserMode(withoutOp, 'alice', 'halfop', true);
  const withoutVoice = updateChannelUserMode(withHalfop, 'alice', 'voice', false);
  const withoutHalfop = updateChannelUserMode(withoutVoice, 'alice', 'halfop', false);

  assert.deepEqual(projectUserModes(withoutOp), [
    { nick: 'alice', mode: 'voice', modes: ['voice'], away: false },
  ]);
  assert.deepEqual(projectUserModes(withHalfop), [
    { nick: 'alice', mode: 'halfop', modes: ['halfop', 'voice'], away: false },
  ]);
  assert.deepEqual(projectUserModes(withoutVoice), [
    { nick: 'alice', mode: 'halfop', modes: ['halfop'], away: false },
  ]);
  assert.deepEqual(projectUserModes(withoutHalfop), [
    { nick: 'alice', mode: 'normal', modes: [], away: false },
  ]);
});

test('primary channel user mode is derived from the highest active privilege', () => {
  assert.equal(getPrimaryChannelUserMode(['voice', 'op']), 'op');
  assert.equal(getPrimaryChannelUserMode([]), 'normal');
});
