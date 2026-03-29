import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import { createNetworkActions, resolveManagedNetworkConnectPlan } from '../web/src/app-actions-networks.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerConnectButtonState,
  getNetworkManagerRowStatus,
  getNetworkManagerStatusLabel,
} from '../web/src/network-manager-dialog-model.js';
import { buildManagedRuntimeMap } from '../web/src/network-manager-runtime.js';
import { createConnectionInstancePayload } from '../web/src/network-form.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'saved-network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? false,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  username: overrides.username ?? 'sofia',
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  authMethod: overrides.authMethod,
  authTarget: overrides.authTarget,
  authAccount: overrides.authAccount,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makePeer = (root: NetworkProfile, overrides: Partial<NetworkProfile> = {}): NetworkProfile =>
  makeNetwork({
    ...root,
    id: overrides.id ?? 'instance-1',
    templateId: overrides.templateId ?? root.id,
    managerHidden: overrides.managerHidden ?? true,
    ...overrides,
  });

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'server-buffer-1',
  networkId: overrides.networkId ?? 'instance-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const emptyWorkspace: WorkspaceView = {
  mode: 'empty',
  selection: null,
  connectionInstances: [],
  selectedNetwork: null,
  selectedRuntime: null,
  selectedBuffer: null,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: '',
  headerSubtitle: '',
  composerMode: 'hidden',
  composerPlaceholder: '',
  emptyBody: '',
  showNicklist: false,
};

const makeSession = ({
  networks,
  buffers = [],
  networkStates = {},
  workspace = emptyWorkspace,
}: {
  networks: NetworkProfile[];
  buffers?: BufferState[];
  networkStates?: State['domain']['networkStates'];
  workspace?: WorkspaceView;
}): AppSessionSnapshot => {
  const state: State = {
    ...initialState,
    domain: {
      ...initialState.domain,
      phase: 'ready',
      gatewayStatus: 'connected',
      networks,
      buffers,
      channels: [],
      pendingChannels: [],
      networkStates,
    },
    transient: initialState.transient,
  };

  return {
    conversation: buildConversationModel({
      buffers: state.domain.buffers,
      channels: state.domain.channels,
      pendingChannels: state.domain.pendingChannels,
    }),
    draft: '',
    state,
    workspace,
  };
};

const createHarness = (session: AppSessionSnapshot) => {
  const dispatched: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const actions = createNetworkActions({
    applyServerMessages: () => {},
    dispatch: (action) => {
      dispatched.push(action);
    },
    getSession: () => session,
    updateBanner: (kind, message) => {
      banners.push({ kind, message });
    },
  });
  return { actions, banners, dispatched };
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

test('getNetworkManagerConnectButtonState disables the button for an already connected network', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'connected', serverName: null, nick: 'sofia' }),
    { label: 'Connected', disabled: true }
  );
});

test('getNetworkManagerConnectButtonState disables the button while a network is connecting', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'connecting', serverName: null, nick: 'sofia' }),
    { label: 'Connecting', disabled: true }
  );
});

test('getNetworkManagerConnectButtonState keeps Connect enabled for offline networks', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'offline', serverName: null, nick: 'sofia' }),
    { label: 'Connect', disabled: false }
  );
});

test('getNetworkManagerConnectButtonState disables the button when nothing is selected', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(null, null),
    { label: 'Connect', disabled: true }
  );
});

test('getNetworkManagerRowStatus keeps Online and Connecting visible independently of selection', () => {
  assert.equal(getNetworkManagerRowStatus({ phase: 'connected', serverName: null, nick: 'sofia' }), 'online');
  assert.equal(getNetworkManagerRowStatus({ phase: 'connecting', serverName: null, nick: 'sofia' }), 'connecting');
  assert.equal(getNetworkManagerRowStatus({ phase: 'offline', serverName: null, nick: 'sofia' }), null);
  assert.equal(getNetworkManagerRowStatus(null), null);
});

test('network manager detail helpers produce scan-friendly UI copy', () => {
  const network = makeNetwork({
    name: 'Libera.Chat',
    authMethod: 'nickserv',
    authAccount: 'sofia',
    autoJoin: ['#pulsete', '#ops'],
  });

  assert.equal(getNetworkManagerAuthLabel(network), 'NickServ');
  assert.equal(getNetworkManagerAutoJoinLabel(network), '2 channels');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'connected', serverName: null, nick: network.nick }), 'Online');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'connecting', serverName: null, nick: network.nick }), 'Connecting');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'offline', serverName: null, nick: network.nick }), 'Offline');
});

