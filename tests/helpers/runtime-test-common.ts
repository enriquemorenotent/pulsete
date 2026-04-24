import type { NetworkInput } from '../../server/storage.js';
import type { ChannelUserState } from '../../shared/protocol.js';
import { waitFor } from './async-test-helpers.js';

export { waitFor };

export const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
): ChannelUserState => ({
  nick,
  mode,
  away,
  account: null,
  username: null,
  host: null,
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
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});
