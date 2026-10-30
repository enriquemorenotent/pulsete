import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IrcConnection } from '../server/irc.js';
import type { RuntimeEvent } from '../server/irc-types.js';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Storage } from '../server/storage.js';
import { createComposerStore } from '../web/src/composer-store.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';
import { decodeServer, encode } from '../shared/protocol-messages.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';

for (const failure of ['length', 'disconnected', 'write'] as const) {
  for (const kind of ['message', 'action'] as const) {
    test(`local ${failure} failure restores a ${kind} draft without adding a transcript message`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'pulsete-send-recovery-'));
      const storage = new Storage(join(directory, 'db.sqlite'));
      try {
        const network = storage.networks.upsert(createNetworkInput());
        const source = storage.conversations.upsertBuffer({ networkId: network.id, target: '#chat', kind: 'channel' });
        const events: RuntimeEvent[] = [];
        const writes: string[] = [];
        const connection = new IrcConnection(network, { onEvent: (event) => events.push(event) });
        connection.lifecycle.connected = failure !== 'disconnected';
        if (failure !== 'disconnected') attachMockSocket(connection, createMockSocket(writes,
          { failWrite: failure === 'write', emitCloseOnDestroy: false }));
        // Include negotiated labels in the command-size check.
        connection.lifecycle.capabilities.negotiated.add('labeled-response');
        const body = failure === 'length' ? '😀'.repeat(150) : 'try again';
        if (kind === 'action') connection.action('#chat', body);
        else connection.say('#chat', body);

        const composer = createComposerStore();
        const bridge = createServerMessageBridge(() => {}, { recoverRejectedDraft: composer.recoverRejectedDraft });
        for (const event of events) handleRuntimeEvent({ store: storage,
          publish: (message) => bridge.applySocketMessage(decodeServer(encode(message))),
        }, event);
        assert.equal(composer.getDraft(source.id), kind === 'action' ? `/me ${body}` : body);
        assert.equal(events.filter((event) => event.type === 'send-failed').length, 1);
        assert.equal(events.some((event) => event.type === 'message' || event.type === 'status'), false);
        assert.deepEqual(storage.conversations.listMessages(network.id, '#chat', 10), []);
        if (failure !== 'write') assert.equal(writes.length, 0);
      } finally {
        storage.close();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}

test('local rejection preserves the original target of a cross-conversation message', () => {
  const events: RuntimeEvent[] = [];
  const connection = new IrcConnection({ ...createNetworkInput(), id: 'network', hasPassword: false,
    workspaceOpen: false, favorite: false, autoJoin: [],
  },
    { onEvent: (event) => events.push(event) });
  connection.say('alice', 'hello', '#chat');
  const failure = events.find((event) => event.type === 'send-failed');
  assert.equal(failure?.sourceTarget, '#chat');
  assert.equal(failure?.retryDraft, '/msg alice hello');
});
