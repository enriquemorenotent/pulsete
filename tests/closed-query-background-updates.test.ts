import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import {
  closeRuntimeConversationBuffer,
  markRuntimeConversationBufferRead,
  saveRuntimeConversationBufferNotes,
  clearRuntimeConversationBufferHistory,
} from '../server/runtime-conversation-buffer-actions.js';
import {
  handleRuntimeConversationMessageEvent,
  handleRuntimeConversationPeerQuitEvent,
  handleRuntimeConversationStatusEvent,
} from '../server/runtime-conversation-event-actions.js';
import { decodeServer, type ServerMessage } from '../shared/protocol-messages.js';
import { initialState, reducer } from '../web/src/app-state.js';
import { dispatchInboundServerMessage } from '../web/src/server-message-actions.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

const mutations = {
  read: markRuntimeConversationBufferRead,
  notes: (options: Parameters<typeof saveRuntimeConversationBufferNotes>[0], id: string) =>
    saveRuntimeConversationBufferNotes(options, id, 'Saved note'),
  history: clearRuntimeConversationBufferHistory,
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`late ${name} updates do not restore a closed PM`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'pulsete-closed-query-'));
    const storage = new Storage(join(dir, 'db.sqlite'));
    t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });
    const network = storage.networks.upsert(createNetworkInput());
    const query = storage.conversations.upsertQuery(network.id, 'helper');
    const options = {
      conversations: storage.conversations,
      networks: storage.networks,
      mutedNicks: storage.mutedNicks,
    };
    let state = reducer(initialState, { type: 'upsert-buffer', buffer: query });
    const apply = (messages: ServerMessage[]) => {
      for (const message of messages) {
        dispatchInboundServerMessage(decodeServer(JSON.stringify(message)), (action) => {
          state = reducer(state, action);
        });
      }
    };

    // A normal background update still reaches an open PM.
    const pending = mutate(options, query.id);
    apply(pending.messages);
    assert.deepEqual(state.domain.buffers.find((buffer) => buffer.id === query.id), pending.buffer);
    apply(closeRuntimeConversationBuffer(options, query.id).messages);

    // Simulate an HTTP response arriving after the close broadcast.
    apply(pending.messages);
    assert.equal(state.domain.buffers.some((buffer) => buffer.id === query.id), false);

    // Requests reaching the server after close must not publish an opening update either.
    const afterClose = mutate(options, query.id);
    assert.equal(afterClose.messages.some((message) => message.type === 'buffer.upsert'), false);
    apply(afterClose.messages);
    assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);
    if (name === 'notes') assert.equal(storage.conversations.getBuffer(query.id)?.notes, 'Saved note');

    apply(handleRuntimeConversationStatusEvent(options, {
      type: 'status', networkId: network.id, target: 'helper',
      kind: 'system', message: '* helper is away: Auto-away', requireBoundTarget: true,
    }));
    apply(handleRuntimeConversationPeerQuitEvent(options, {
      type: 'peer-quit', networkId: network.id, nick: 'helper', reason: 'bye', self: false,
    }));
    assert.equal(state.domain.buffers.some((buffer) => buffer.id === query.id), false);
    assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);

    // A real incoming PM still reopens the conversation.
    apply(handleRuntimeConversationMessageEvent(options, {
      type: 'message', message: {
        id: 'new-message', networkId: network.id, target: 'helper', nick: 'helper',
        body: 'Hello again', kind: 'line', self: false, ts: Date.now(),
      },
    }));
    assert.equal(state.domain.buffers.some((buffer) => buffer.id === query.id), true);
    assert.ok(storage.conversations.getBufferByTarget(network.id, 'helper'));
  });
}
