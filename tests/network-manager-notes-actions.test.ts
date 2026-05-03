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
  username: 'sofia',
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
  const fetchCalls: Array<{ url: string; method: string; notes: string }> = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      notes: JSON.parse(String(init?.body ?? '{}')).notes,
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
      method: 'PUT',
      notes: 'Character: Mira',
    }]);
    assert.equal(updated?.notes, 'Character: Mira');
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
