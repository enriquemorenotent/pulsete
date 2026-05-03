import type { NetworkInput } from '../../server/storage.js';
import { identityFromNick } from '../../shared/user-identity.js';
import type { ChannelUserState } from '../../shared/protocol-chat.js';
import { waitFor } from './async-test-helpers.js';

export { waitFor };

export const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
): ChannelUserState => ({
  nick,
  mode,
  modes: mode === 'normal' ? [] : [mode],
  away,
  account: null,
  username: null,
  host: null,
  identity: identityFromNick(nick),
  realname: null,
});

export const createNetworkInput = (overrides: Partial<NetworkInput> = {}): NetworkInput => ({
  workspaceOpen: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});
