import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState, reducer } from '../web/src/app-state.js';
import { makeBuffer, makeNetwork, makeState } from './helpers/app-state-test-helpers.js';

test('removing a network prunes its runtime and durable user state', () => {
  const removedQuery = makeBuffer({
    id: 'query-1',
    networkId: 'network-1',
    kind: 'query',
    target: 'Alice',
  });
  const retainedQuery = makeBuffer({
    id: 'query-2',
    networkId: 'network-2',
    kind: 'query',
    target: 'Bob',
  });
  const state = makeState({
    domain: {
      networks: [
        makeNetwork({ id: 'network-1', workspaceOpen: true }),
        makeNetwork({ id: 'network-2', workspaceOpen: true }),
      ],
      buffers: [removedQuery, retainedQuery],
      mutedNicks: [
        { id: 'mute-1', networkId: 'network-1', nick: 'Alice' },
        { id: 'mute-2', networkId: 'network-2', nick: 'Bob' },
      ],
      queryPresence: {
        [removedQuery.id]: 'online',
        [retainedQuery.id]: 'away',
      },
      drafts: [
        { bufferId: 'closed-1', networkId: 'network-1', body: 'remove', updatedAt: 1 },
        { bufferId: 'closed-2', networkId: 'network-2', body: 'keep', updatedAt: 2 },
      ],
      userAvatarOverrides: [
        {
          id: 'avatar-1',
          networkId: 'network-1',
          nick: 'Alice',
          identity: { kind: 'nick', value: 'alice' },
          imageUrl: '/avatar-1',
          updatedAt: 1,
        },
        {
          id: 'avatar-2',
          networkId: 'network-2',
          nick: 'Bob',
          identity: { kind: 'nick', value: 'bob' },
          imageUrl: '/avatar-2',
          updatedAt: 2,
        },
      ],
      preferences: {
        ...initialState.domain.preferences,
        contactNotifications: {
          ...initialState.domain.preferences.contactNotifications,
          contacts: [
            { networkId: 'network-1', nick: 'Alice' },
            { networkId: 'network-2', nick: 'Bob' },
          ],
        },
        serverSidebarAccordions: {
          'network-1': { notes: false },
          'network-2': { history: false },
        },
      },
    },
  });

  const nextState = reducer(state, { type: 'remove-network', networkId: 'network-1' });

  assert.deepEqual(nextState.domain.mutedNicks.map((mutedNick) => mutedNick.id), ['mute-2']);
  assert.equal(removedQuery.id in nextState.domain.queryPresence, false);
  assert.equal(nextState.domain.queryPresence[retainedQuery.id], 'away');
  assert.deepEqual(nextState.domain.drafts.map((draft) => draft.bufferId), ['closed-2']);
  assert.deepEqual(nextState.domain.userAvatarOverrides.map((avatar) => avatar.id), ['avatar-2']);
  assert.deepEqual(
    nextState.domain.preferences.contactNotifications.contacts.map((contact) => contact.networkId),
    ['network-2'],
  );
  assert.deepEqual(nextState.domain.preferences.serverSidebarAccordions, {
    'network-2': { history: false },
  });
});

test('buffer close keeps its durable draft available for reopening', () => {
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const state = makeState({
    domain: {
      buffers: [query],
      drafts: [{
        bufferId: query.id,
        networkId: query.networkId,
        body: 'unfinished',
        updatedAt: 1,
      }],
    },
  });

  const next = reducer(state, {
    type: 'remove-buffer',
    bufferId: query.id,
    networkId: query.networkId,
  });

  assert.deepEqual(next.domain.drafts, state.domain.drafts);
});
