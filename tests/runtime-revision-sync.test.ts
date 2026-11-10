import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';
import type { Action } from '../web/src/app-types.js';
import { decodeServer, type ServerMessage } from '../shared/protocol-messages.js';
import { createRuntime } from '../server/runtime.js';

test('mutations and broadcasts carry identical revisions and snapshots mark the current stream', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  try {
    const initial = context.runtime.ws.snapshot().sync!;
    assert.equal(initial.revision, 0);
    const broadcast = waitForWebSocketMessageType(context.socket!, 'network.upsert');
    const result = context.runtime.http.networks.save(createNetworkInput());
    const received = await broadcast;
    assert.deepEqual(received.sync, result.messages[0]!.sync);
    assert.equal(result.messages[0]!.sync!.revision, 1);
    assert.deepEqual(context.runtime.ws.snapshot().sync, result.messages.at(-1)!.sync);
    const refreshed = waitForWebSocketMessageType(context.socket!, 'state.ready');
    context.socket!.send(JSON.stringify({ type: 'state.sync' }));
    const ready = decodeServer(JSON.stringify(await refreshed));
    assert.equal(ready.type, 'state.ready');
    if (ready.type === 'state.ready') assert.deepEqual(ready.snapshot.sync, context.runtime.ws.snapshot().sync);
    const nextRuntime = createRuntime(context.storage);
    assert.notEqual(nextRuntime.ws.snapshot().sync!.epoch, initial.epoch);
    nextRuntime.gateway.close();
  } finally { await context.close(); }
});

test('a missed live update triggers snapshot recovery over the same websocket', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  try {
    const actions: Action[] = [];
    const bridge = createServerMessageBridge(action => actions.push(action), {
      requestSnapshot: () => { context.socket!.send(JSON.stringify({ type: 'state.sync' })); return true; },
    });
    bridge.applySocketMessage({ type: 'state.ready', snapshot: context.runtime.ws.snapshot() });
    context.socket!.on('message', raw => {
      const message = decodeServer(raw.toString());
      if (message.sync?.revision === 1) return; // Simulate one lost update.
      bridge.applySocketMessage(message);
    });
    const first = context.runtime.http.networks.save(createNetworkInput());
    const recovered = waitForWebSocketMessageType(context.socket!, 'state.ready');
    context.runtime.http.networks.update({ notes: 'newest notes' }, first.network.id);
    await recovered;
    const latest = actions.filter((action): action is Extract<Action, { type: 'snapshot' }> => action.type === 'snapshot').at(-1)!;
    assert.equal(latest.snapshot.networks[0]?.notes, 'newest notes');
    const count = actions.length;
    bridge.applyMutationMessages(first.messages as ServerMessage[]);
    assert.equal(actions.length, count);
  } finally { await context.close(); }
});
