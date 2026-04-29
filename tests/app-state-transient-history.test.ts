import assert from 'node:assert/strict';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import { makeBuffer, makeNetwork, makeState } from './helpers/app-state-test-helpers.js';

test('closing a workspace network prunes stale buffer history flags', () => {
  const closedNetwork = makeNetwork({ id: 'network-1', workspaceOpen: false });
  const retainedNetwork = makeNetwork({ id: 'network-2', workspaceOpen: true });
  const removedBuffer = makeBuffer({ id: 'buffer-1', networkId: closedNetwork.id });
  const retainedBuffer = makeBuffer({ id: 'buffer-2', networkId: retainedNetwork.id });
  const state = makeState({
    domain: {
      phase: 'ready',
      networks: [{ ...closedNetwork, workspaceOpen: true }, retainedNetwork],
      buffers: [removedBuffer, retainedBuffer],
    },
    transient: {
      historyLoadedByBufferId: {
        [removedBuffer.id]: true,
        [retainedBuffer.id]: true,
      },
      historyHasOlderByBufferId: {
        [removedBuffer.id]: true,
        [retainedBuffer.id]: false,
      },
    },
  });

  const nextState = reducer(state, {
    type: 'upsert-network',
    network: closedNetwork,
  });

  assert.deepEqual(nextState.domain.buffers, [retainedBuffer]);
  assert.deepEqual(nextState.transient.historyLoadedByBufferId, {
    [retainedBuffer.id]: true,
  });
  assert.deepEqual(nextState.transient.historyHasOlderByBufferId, {
    [retainedBuffer.id]: false,
  });
});
