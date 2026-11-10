import assert from 'node:assert/strict';
import test from 'node:test';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { initialState } from '../web/src/app-state.js';
import { createNetworkActions } from '../web/src/app-actions-networks.js';

const network: NetworkProfile = {
  id: 'saved-1',
  workspaceOpen: true,
  name: 'RoleplayNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  altNicks: ['sofia_', 'sofia__'],
  realName: 'Sofia',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
  notes: 'Character: Sofia',
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

test('saveNetworkNotes sends the sidebar notes update for the selected network', async () => {
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const actions = createNetworkActions({
    applyServerMessages: () => undefined,
    dispatch: () => undefined,
    getState: () => ({
      ...initialState,
      domain: {
        ...initialState.domain,
        phase: 'ready',
        networks: [network],
      },
    }),
    updateBanner: (kind, message) => {
      banners.push({ kind, message });
    },
  });
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return okJson({
      messages: [],
      network: { ...network, notes: 'Character: Mira' },
      serverBuffer: null,
    });
  }) as typeof fetch;

  try {
    const updated = await actions.saveNetworkNotes(network, 'Character: Mira');

    assert.deepEqual(fetchCalls, [{
      url: '/api/networks/saved-1',
      method: 'PATCH',
      body: { notes: 'Character: Mira' },
    }]);
    assert.equal(updated?.notes, 'Character: Mira');
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('favorite changes send only the favorite field, even with a stale profile', async t => {
  const calls: { method: string | undefined; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    calls.push({ method: init.method, body: JSON.parse(String(init.body)) });
    return okJson({ network: { ...network, favorite: true }, messages: [], serverBuffer: null });
  });
  const actions = createNetworkActions({
    applyServerMessages() {}, dispatch() {}, getState: () => initialState, updateBanner() {},
  });
  await actions.saveFavorite(network, true);
  assert.deepEqual(calls, [{ method: 'PATCH', body: { favorite: true } }]);
});
