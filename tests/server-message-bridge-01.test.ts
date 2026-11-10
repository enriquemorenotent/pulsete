import assert from 'node:assert/strict';
import test from 'node:test';
import { appSnapshotSchema } from '../shared/protocol-app.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { Action } from '../web/src/app-types.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';

const snapshot = (revision = 0, epoch = 'runtime-a'): ServerMessage => ({ type: 'state.ready', snapshot: appSnapshotSchema.parse({
  sync: { epoch, revision }, networks: [], friends: [], friendPresence: {}, buffers: [], channels: [], messages: [], networkStates: {},
}) });
const update = (revision: number, epoch = 'runtime-a'): ServerMessage => ({ type: 'network.remove', networkId: `network-${revision}`, sync: { epoch, revision } });
function setup() {
  const actions: Action[] = [];
  let refreshes = 0;
  const bridge = createServerMessageBridge(action => actions.push(action), { requestSnapshot: () => { refreshes++; return true; } });
  bridge.applySocketMessage(snapshot());
  actions.length = 0;
  return { bridge, actions, refreshes: () => refreshes };
}

test('HTTP and websocket updates are applied once in either delivery order', () => {
  for (const httpFirst of [false, true]) {
    const { bridge, actions } = setup();
    const messages = [update(1), update(2)];
    if (httpFirst) bridge.applyMutationMessages(messages);
    messages.forEach(bridge.applySocketMessage);
    if (!httpFirst) bridge.applyMutationMessages(messages);
    assert.deepEqual(actions, [{ type: 'remove-network', networkId: 'network-1' }, { type: 'remove-network', networkId: 'network-2' }]);
    // There is no expiry window: replayed old replies remain stale indefinitely.
    bridge.applyMutationMessages(messages);
    assert.equal(actions.length, 2);
  }
});

test('a missing revision requests one snapshot and suspends incomplete state updates', () => {
  const { bridge, actions, refreshes } = setup();
  bridge.applySocketMessage(update(2));
  bridge.applyMutationMessages([update(3)]);
  bridge.applySocketMessage(update(1));
  assert.equal(refreshes(), 1);
  assert.equal(actions.length, 0);
  bridge.applySocketMessage(snapshot(3));
  bridge.applyMutationMessages([update(2)]);
  bridge.applySocketMessage(update(4));
  assert.deepEqual(actions.map(action => action.type), ['gateway-connected', 'snapshot', 'remove-network']);
});

test('out-of-order HTTP responses recover instead of silently skipping an unrelated change', () => {
  const { bridge, actions, refreshes } = setup();
  bridge.applyMutationMessages([update(2)]);
  bridge.applyMutationMessages([update(1)]);
  assert.equal(refreshes(), 1);
  assert.equal(actions.length, 0);
  bridge.applySocketMessage(snapshot(2));
  assert.equal(actions.at(-1)?.type, 'snapshot');
});

test('a restarted runtime establishes a new epoch and old HTTP responses are ignored', () => {
  const { bridge, actions, refreshes } = setup();
  bridge.applySocketMessage(update(1));
  bridge.applySocketMessage(snapshot(0, 'runtime-b'));
  actions.length = 0;
  bridge.applyMutationMessages([update(200)]);
  bridge.applySocketMessage(update(1, 'runtime-b'));
  assert.equal(refreshes(), 0);
  assert.deepEqual(actions, [{ type: 'remove-network', networkId: 'network-1' }]);
});

test('a stale snapshot cannot roll back newer HTTP updates', () => {
  const { bridge, actions, refreshes } = setup();
  bridge.applyMutationMessages([update(1), update(2)]);
  actions.length = 0;
  bridge.applySocketMessage(snapshot(1));
  assert.equal(actions.length, 0);
  assert.equal(refreshes(), 1);
  bridge.applySocketMessage(snapshot(2));
  assert.equal(actions.at(-1)?.type, 'snapshot');
});

test('private replies work during recovery but unversioned shared updates do not', () => {
  const { bridge, actions } = setup();
  bridge.applySocketMessage(update(3));
  bridge.applySocketMessage({ type: 'notice', networkId: null, message: 'Private reply' });
  bridge.applySocketMessage({ type: 'network.remove', networkId: 'stale' });
  bridge.applyMutationMessages([{ type: 'network.remove', networkId: 'stale' }]);
  assert.deepEqual(actions, [{ type: 'set-banner', banner: { kind: 'notice', message: 'Private reply' } }]);
});

test('a snapshot on reconnect recovers even if requesting one was impossible while disconnected', () => {
  const actions: Action[] = [];
  const bridge = createServerMessageBridge(action => actions.push(action), { requestSnapshot: () => false });
  bridge.applySocketMessage(snapshot());
  bridge.applyMutationMessages([update(3)]);
  bridge.applySocketMessage(snapshot(3));
  bridge.applySocketMessage(update(4));
  assert.equal(actions.at(-1)?.type, 'remove-network');
});

test('unversioned fixtures retain their dispatch behavior before a versioned snapshot', () => {
  const actions: Action[] = [];
  const bridge = createServerMessageBridge(action => actions.push(action));
  bridge.applySocketMessage({ type: 'network.remove', networkId: 'a' });
  assert.deepEqual(actions, [{ type: 'remove-network', networkId: 'a' }]);
});
