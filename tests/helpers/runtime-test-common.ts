import type { NetworkInput } from '../../server/storage.js';
import type { ChannelUserState } from '../../shared/protocol.js';
import { waitFor } from './async-test-helpers.js';

export { waitFor };

export const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

export const createNetworkInput = (overrides: Partial<NetworkInput> = {}): NetworkInput => ({
  templateId: null,
  managerHidden: false,
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
