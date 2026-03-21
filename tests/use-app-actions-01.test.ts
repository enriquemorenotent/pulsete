import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,ChannelState,ClientMessage,NetworkProfile } from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import type { Action,State } from '../web/src/app-types.js';
import type { SocketHandle } from '../web/src/client.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { useAppActions } from '../web/src/useAppActions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

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
  realName: 'tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

const selectedBuffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
};

const selectedChannel: ChannelState = {
  id: selectedBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: '',
  users: [],
};

const workspace: WorkspaceView = {
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: { phase: 'connected', serverName: 'irc.example.test', nick: 'tester' },
  selectedBuffer,
  selectedChannel,
  selectedPendingChannel: null,
  headerTitle: '#general',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: 'Message #general',
  emptyBody: '',
  showNicklist: true,
};

const makeState = (overrides: Partial<State> = {}): State => ({
  ...initialState,
  phase: 'ready',
  gatewayStatus: 'connected',
  networks: [network],
  buffers: [selectedBuffer],
  channels: [selectedChannel],
  pendingChannels: [],
  selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  networkStates: {
    [network.id]: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: 'tester',
    },
  },
  ...overrides,
});

const createParams = (options: {
  draft?: string;
  state?: State;
  socket?: SocketHandle | null;
}) => {
  const actions: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const composerEntries: string[] = [];
  const state = options.state ?? makeState();

  return {
    actions,
    banners,
    composerEntries,
    params: {
      state,
      draft: options.draft ?? '',
      workspace,
      dispatch: (action: Action) => {
        actions.push(action);
      },
      socketRef: { current: options.socket ?? null },
      setShowNetworkEditor: () => {},
      setShowNetworkManager: () => {},
      setManagedNetworkId: () => {},
      setEditorTab: () => {},
      setDraft: () => {},
      recordComposerEntry: (value: string) => {
        composerEntries.push(value);
      },
      updateBanner: (kind: 'notice' | 'error', message: string) => {
        banners.push({ kind, message });
      },
    },
  };
};

test('openChannelList sends the request before opening local dialog state', async () => {
  const log: string[] = [];
  const { params } = createParams({
    socket: {
      send(message: ClientMessage) {
        log.push(`send:${message.type}`);
      },
      close() {},
    },
  });
  const actions = useAppActions({
    ...params,
    dispatch: (action) => {
      log.push(`dispatch:${action.type}`);
    },
  });

  await actions.openChannelList();

  assert.deepEqual(log, ['send:channel.list.request', 'dispatch:open-channel-list']);
});

test('openMentionedChannel sends channel.join and selects the pending channel locally', async () => {
  const sent: ClientMessage[] = [];
  const { params, actions: dispatched, banners } = createParams({
    socket: {
      send(message) {
        sent.push(message);
      },
      close() {},
    },
  });
  const actions = useAppActions(params);

  await actions.openMentionedChannel('#help');

  assert.deepEqual(sent, [
    {
      type: 'channel.join',
      networkId: network.id,
      channel: '#help',
      sourceBufferId: selectedBuffer.id,
    },
  ]);
  assert.deepEqual(dispatched, [
    {
      type: 'select',
      selection: { kind: 'pending-channel', networkId: network.id, channel: '#help' },
    },
  ]);
  assert.deepEqual(banners, []);
});

test('joinChannelFromList reuses an existing pending channel selection without sending twice', async () => {
  const sent: ClientMessage[] = [];
  const { params, actions: dispatched, banners } = createParams({
    state: makeState({
      pendingChannels: [{ networkId: network.id, channel: '#help' }],
      channelList: {
        open: true,
        networkId: network.id,
        requestId: 'request-1',
        status: 'ready',
        entries: [],
        error: null,
      },
    }),
    socket: {
      send(message) {
        sent.push(message);
      },
      close() {},
    },
  });
  const actions = useAppActions(params);

  await actions.joinChannelFromList('#help');

  assert.deepEqual(sent, []);
  assert.deepEqual(dispatched, [
    {
      type: 'select',
      selection: { kind: 'pending-channel', networkId: network.id, channel: '#help' },
    },
  ]);
  assert.deepEqual(banners, []);
});

test('openChannelList does not wedge loading state when the socket send fails', async () => {
  const { params, actions: dispatched, banners } = createParams({
    socket: {
      send() {
        throw new Error('Gateway socket is not open');
      },
      close() {},
    },
  });
  const actions = useAppActions(params);

  await actions.openChannelList();

  assert.deepEqual(dispatched, []);
  assert.deepEqual(banners, [{ kind: 'error', message: gatewayReconnectMessage }]);
});
