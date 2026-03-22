import assert from 'node:assert/strict';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import { makeBuffer, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('adding a pending channel is a no-op when a matching channel buffer already exists', () => {
  const state = makeState({
    domain: {
      buffers: [makeBuffer({ id: 'channel-1', kind: 'channel', target: '#Help' })],
    },
  });

  const nextState = reducer(state, {
    type: 'add-pending-channel',
    pendingChannel: makePendingChannel({ channel: '#help' }),
  });

  assert.equal(nextState, state);
});
