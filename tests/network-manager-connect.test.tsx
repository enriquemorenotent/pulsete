import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';
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
}: {
  networks: NetworkProfile[];
  buffers?: BufferState[];
  networkStates?: State['domain']['networkStates'];
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
    workspace: emptyWorkspace,
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

test('resolveManagedNetworkConnectPlan returns connected and connecting no-op states', () => {
  const saved = makeNetwork();
  const connectedPeer = makePeer(saved, { id: 'instance-connected' });
  const connectingPeer = makePeer(saved, { id: 'instance-connecting' });

  assert.deepEqual(
    resolveManagedNetworkConnectPlan({
      network: saved,
      networks: [saved, connectedPeer],
      networkStates: { [connectedPeer.id]: { phase: 'connected', serverName: null, nick: connectedPeer.nick } },
    }),
    { kind: 'noop-connected' }
  );
  assert.deepEqual(
    resolveManagedNetworkConnectPlan({
      network: saved,
      networks: [saved, connectingPeer],
      networkStates: { [connectingPeer.id]: { phase: 'connecting', serverName: null, nick: connectingPeer.nick } },
    }),
    { kind: 'noop-connecting' }
  );
});

test('resolveManagedNetworkConnectPlan reuses the first offline peer before creating a new instance', () => {
  const saved = makeNetwork();
  const firstPeer = makePeer(saved, { id: 'instance-1' });
  const secondPeer = makePeer(saved, { id: 'instance-2' });

  assert.deepEqual(
    resolveManagedNetworkConnectPlan({
      network: saved,
      networks: [saved, firstPeer, secondPeer],
      networkStates: {
        [firstPeer.id]: { phase: 'offline', serverName: null, nick: firstPeer.nick },
        [secondPeer.id]: { phase: 'offline', serverName: null, nick: secondPeer.nick },
      },
    }),
    { kind: 'reconnect-existing-peer', peer: firstPeer }
  );
  assert.deepEqual(
    resolveManagedNetworkConnectPlan({
      network: saved,
      networks: [saved],
      networkStates: {},
    }),
    { kind: 'create-new-peer' }
  );
});

test('buildManagedRuntimeMap exposes visible row statuses for every saved network', () => {
  const onlineSaved = makeNetwork({ id: 'saved-online', name: 'Online Net' });
  const connectingSaved = makeNetwork({ id: 'saved-connecting', name: 'Connecting Net' });
  const idleSaved = makeNetwork({ id: 'saved-idle', name: 'Idle Net' });
  const onlinePeer = makePeer(onlineSaved, { id: 'instance-online' });
  const connectingPeer = makePeer(connectingSaved, { id: 'instance-connecting' });

  assert.deepEqual(
    buildManagedRuntimeMap(
      [onlineSaved, connectingSaved, idleSaved],
      [onlinePeer, connectingPeer],
      {
        [onlinePeer.id]: { phase: 'connected', serverName: null, nick: onlinePeer.nick },
        [connectingPeer.id]: { phase: 'connecting', serverName: null, nick: connectingPeer.nick },
      }
    ),
    {
      [onlineSaved.id]: { phase: 'connected', serverName: null, nick: onlineSaved.nick },
      [connectingSaved.id]: { phase: 'connecting', serverName: null, nick: connectingSaved.nick },
      [idleSaved.id]: null,
    }
  );
});

test('connectNetwork is a silent no-op when a saved network already has a connected peer', async () => {
  const saved = makeNetwork();
  const peer = makePeer(saved);
  const session = makeSession({
    networks: [saved, peer],
    networkStates: { [peer.id]: { phase: 'connected', serverName: null, nick: peer.nick } },
  });
  const { actions, banners, dispatched } = createHarness(session);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return okJson({ ok: true });
  }) as typeof fetch;

  try {
    const started = await actions.connectNetwork(saved);

    assert.equal(started, false);
    assert.equal(fetchCalled, false);
    assert.deepEqual(banners, []);
    assert.deepEqual(dispatched, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('connectNetwork reconnects an existing offline peer instead of creating a duplicate instance', async () => {
  const saved = makeNetwork();
  const peer = makePeer(saved, { id: 'instance-offline' });
  const serverBuffer = makeBuffer({ id: 'server-buffer-offline', networkId: peer.id });
  const session = makeSession({
    networks: [saved, peer],
    buffers: [serverBuffer],
    networkStates: { [peer.id]: { phase: 'offline', serverName: null, nick: peer.nick } },
  });
  const { actions, banners, dispatched } = createHarness(session);
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === `/api/networks/${peer.id}/connect`) {
      return okJson({ ok: true });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const started = await actions.connectNetwork(saved);

    assert.equal(started, true);
    assert.deepEqual(fetchCalls, [{
      url: `/api/networks/${peer.id}/connect`,
      method: 'POST',
      body: '{}',
    }]);
    assert.deepEqual(banners, [{ kind: 'notice', message: 'Reconnect requested' }]);
    assert.deepEqual(dispatched, [{ type: 'select', selection: { kind: 'buffer', bufferId: serverBuffer.id } }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('connectNetwork creates a new hidden instance when no peer exists yet', async () => {
  const saved = makeNetwork();
  const instance = makePeer(saved, { id: 'instance-new' });
  const serverBuffer = makeBuffer({ id: 'server-buffer-new', networkId: instance.id });
  const session = makeSession({ networks: [saved] });
  const { actions, banners, dispatched } = createHarness(session);
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === '/api/networks') {
      return okJson({ network: instance, serverBuffer, messages: [] });
    }
    if (String(input) === `/api/networks/${instance.id}/connect`) {
      return okJson({ ok: true });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const started = await actions.connectNetwork(saved);

    assert.equal(started, true);
    assert.deepEqual(fetchCalls, [
      {
        url: '/api/networks',
        method: 'POST',
        body: JSON.stringify(createConnectionInstancePayload(saved)),
      },
      {
        url: `/api/networks/${instance.id}/connect`,
        method: 'POST',
        body: '{}',
      },
    ]);
    assert.deepEqual(banners, [{ kind: 'notice', message: 'Opened connection instance' }]);
    assert.deepEqual(dispatched, [{ type: 'select', selection: { kind: 'buffer', bufferId: serverBuffer.id } }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
