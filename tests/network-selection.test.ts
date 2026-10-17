import assert from 'node:assert/strict';
import test from 'node:test';
import { createNetworkActions } from '../web/src/app-actions-networks.js';
import { reducer } from '../web/src/app-state.js';
import { emptySnapshot, makeBuffer, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

const networkA = makeNetwork({ id: 'a', workspaceOpen: true });
const networkB = makeNetwork({ id: 'b', workspaceOpen: true });
const serverA = makeBuffer({ id: 'a:server', networkId: 'a' });
const serverB = makeBuffer({ id: 'b:server', networkId: 'b' });
const channelA = makeBuffer({ id: 'a:channel', networkId: 'a', kind: 'channel', target: '#help' });
const queryA = makeBuffer({ id: 'a:query', networkId: 'a', kind: 'query', target: 'Alice' });
const queryB = makeBuffer({ id: 'b:query', networkId: 'b', kind: 'query', target: 'Bob' });
const selected = (bufferId: string) => ({ kind: 'buffer' as const, bufferId });
const setup = () => {
  let state = makeState({ domain: {
    networks: [networkA, networkB],
    buffers: [serverA, serverB, channelA, queryA, queryB],
  } });
  const dispatch = (action: Parameters<typeof reducer>[1]) => { state = reducer(state, action); };
  const actions = createNetworkActions({
    getState: () => state, dispatch,
    applyServerMessages: () => {}, updateBanner: () => {},
  });
  return { actions, dispatch, state: () => state, select: (bufferId: string) => dispatch({ type: 'select', selection: selected(bufferId) }) };
};

test('server switching restores each server’s last channel or DM and keeps the active view on repeated clicks', () => {
  const h = setup();
  h.select(channelA.id);
  h.actions.switchNetwork(networkB);
  assert.deepEqual(h.state().transient.selection, selected(serverB.id));
  h.select(queryB.id);
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(channelA.id));
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(channelA.id));
  h.select(queryA.id);
  h.actions.switchNetwork(networkB);
  assert.deepEqual(h.state().transient.selection, selected(queryB.id));
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(queryA.id));
});

test('explicitly opening the server log remains possible and remembers that view', () => {
  const h = setup();
  h.select(channelA.id);
  h.actions.selectNetworkBuffer(networkA);
  assert.deepEqual(h.state().transient.selection, selected(serverA.id));
  h.actions.switchNetwork(networkB);
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(serverA.id));
});

test('closing a remembered DM while another server is active falls back to its server log', () => {
  const h = setup();
  h.select(queryA.id);
  h.select(queryB.id);
  h.dispatch({ type: 'remove-buffer', networkId: 'a', bufferId: queryA.id });
  assert.equal(h.state().transient.lastSelectionByNetworkId.a, undefined);
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(serverA.id));
});

test('a pending channel is remembered and follows its joined buffer while another server is active', () => {
  const h = setup();
  const pending = makePendingChannel({ networkId: 'a', channel: '#new' });
  const selection = { kind: 'pending-channel' as const, ...pending };
  h.dispatch({ type: 'add-pending-channel', pendingChannel: pending });
  h.dispatch({ type: 'select', selection });
  h.actions.switchNetwork(networkB);
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selection);
  h.actions.switchNetwork(networkB);
  const joined = makeBuffer({ id: 'a:new', networkId: 'a', kind: 'channel', target: '#NEW' });
  h.dispatch({ type: 'upsert-buffer', buffer: joined });
  h.dispatch({ type: 'remove-pending-channel', ...pending });
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(joined.id));
});

test('a cancelled pending channel falls back to the server log', () => {
  const h = setup();
  const pending = makePendingChannel({ networkId: 'a', channel: '#new' });
  h.dispatch({ type: 'add-pending-channel', pendingChannel: pending });
  h.dispatch({ type: 'select', selection: { kind: 'pending-channel', ...pending } });
  h.actions.switchNetwork(networkB);
  h.dispatch({ type: 'remove-pending-channel', ...pending });
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(serverA.id));
});

test('gateway snapshots preserve valid remembered views and discard removed chats', () => {
  const h = setup();
  h.select(channelA.id);
  h.select(queryB.id);
  const snapshot = { ...emptySnapshot(), networks: [networkA, networkB], buffers: h.state().domain.buffers };
  h.dispatch({ type: 'snapshot', snapshot });
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(channelA.id));
  h.actions.switchNetwork(networkB);
  h.dispatch({ type: 'snapshot', snapshot: { ...snapshot, buffers: [serverA, serverB, queryB] } });
  h.actions.switchNetwork(networkA);
  assert.deepEqual(h.state().transient.selection, selected(serverA.id));
});

test('closed or deleted networks lose their remembered view and cannot be switched to', () => {
  for (const remove of [false, true]) {
    const h = setup();
    h.select(channelA.id);
    h.select(queryB.id);
    h.dispatch(remove
      ? { type: 'remove-network', networkId: 'a' }
      : { type: 'upsert-network', network: { ...networkA, workspaceOpen: false } });
    assert.equal(h.state().transient.lastSelectionByNetworkId.a, undefined);
    h.actions.switchNetwork(networkA);
    assert.deepEqual(h.state().transient.selection, selected(queryB.id));
  }
});
