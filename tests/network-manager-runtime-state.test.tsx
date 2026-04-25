import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import { createNetworkActions } from '../web/src/app-actions-networks.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import { buildManagedRuntimeMap } from '../web/src/network-manager-runtime.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'saved-network-1',
  workspaceOpen: overrides.workspaceOpen ?? false,
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

const emptyWorkspace: WorkspaceView = {
  mode: 'empty',
  selection: null,
  workspaceNetworks: [],
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
    getState: () => session.state,
    getWorkspace: () => session.workspace,
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

test('buildManagedRuntimeMap exposes visible row statuses for every saved network', () => {
  const onlineSaved = makeNetwork({ id: 'saved-online', name: 'Online Net', workspaceOpen: true });
  const connectingSaved = makeNetwork({ id: 'saved-connecting', name: 'Connecting Net', workspaceOpen: true });
  const idleSaved = makeNetwork({ id: 'saved-idle', name: 'Idle Net' });
  const closedSaved = makeNetwork({ id: 'saved-closed', name: 'Closed Net' });

  assert.deepEqual(
    buildManagedRuntimeMap(
      [onlineSaved, connectingSaved, idleSaved, closedSaved],
      {
        [onlineSaved.id]: { phase: 'connected', serverName: null, nick: onlineSaved.nick },
        [connectingSaved.id]: { phase: 'connecting', serverName: null, nick: connectingSaved.nick },
        [closedSaved.id]: { phase: 'connected', serverName: null, nick: closedSaved.nick },
      }
    ),
    {
      [onlineSaved.id]: { phase: 'connected', serverName: null, nick: onlineSaved.nick },
      [connectingSaved.id]: { phase: 'connecting', serverName: null, nick: connectingSaved.nick },
      [idleSaved.id]: null,
      [closedSaved.id]: null,
    }
  );
});

test('connectNetwork is a silent no-op when the network is already connected', async () => {
  const saved = makeNetwork({ workspaceOpen: true });
  const session = makeSession({
    networks: [saved],
    networkStates: { [saved.id]: { phase: 'connected', serverName: null, nick: saved.nick } },
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
