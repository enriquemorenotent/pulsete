import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import { makeStorageFile } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { handleRuntimeConversationMessageEvent } from '../server/runtime-conversation-event-actions.js';
import type { MessageInput } from '../server/storage-types.js';
import type { MessageArrival, ServerMessage } from '../shared/protocol-messages.js';
import { createAppStore } from '../web/src/app-store.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';
import { createRuntime } from '../server/runtime.js';

const setup = () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput({workspaceOpen:true}));
  const message: MessageInput = {id:'new',networkId:network.id,target:'#chat',nick:'Alice',body:'exact arrival',kind:'line',self:false,ts:1};
  const receive = (overrides: Partial<MessageInput> = {}) => handleRuntimeConversationMessageEvent(storage,{type:'message',message:{...message,...overrides}});
  return {storage,network,message,receive};
};

test('server emits exact live arrivals but no arrivals for history, outgoing messages or muted senders', () => {
  const {storage,network,receive} = setup();
  try {
    const live = receive().find(m => m.type === 'message.append');
    assert.ok(live?.type === 'message.append' && live.arrival);
    assert.equal(live.message.body,'exact arrival');
    assert.equal(live.arrival.buffer.id,live.message.bufferId);
    for (const overrides of [{id:'history',historical:true}, {id:'backfill',delivery:'server-history' as const}, {id:'self',self:true}, {id:'system',kind:'system' as const}]) {
      assert.equal(receive(overrides).some(m => m.type === 'message.append' && m.arrival),false);
    }
    storage.mutedNicks.upsert({networkId:network.id,nick:'Alice'});
    assert.equal(receive({id:'muted'}).some(m => m.type === 'message.append' && m.arrival),false);
  } finally { storage.close(); }
});

test('unmuting and snapshot recovery cannot create arrivals; accepted revisions deliver each exact message once', () => {
  const {storage,network,receive} = setup();
  const runtime = createRuntime(storage);
  const store = createAppStore();
  const arrivals: MessageArrival[] = [];
  const unsubscribe = store.subscribeMessageArrivals(event => arrivals.push(event));
  const bridge = createServerMessageBridge(store,{onMessageArrival:store.publishMessageArrival});
  const ready = (revision: number): ServerMessage => ({type:'state.ready',snapshot:{...runtime.gateway.snapshot(),sync:{epoch:'test',revision}}});
  try {
    bridge.applySocketMessage(ready(0));
    const live = receive().find(m => m.type === 'message.append')!;
    const event = {...live,sync:{epoch:'test',revision:1}};
    bridge.applySocketMessage(event);
    bridge.applySocketMessage(event);
    bridge.applyMutationMessages([event]);
    assert.equal(arrivals.length,1);
    assert.equal(arrivals[0]?.message.id,'new');
    // Neither loaded history nor buffer counter updates are message arrivals.
    bridge.applySocketMessage({type:'message.append',message:{...arrivals[0]!.message,id:'loaded-history'},sync:{epoch:'test',revision:2}});
    const muted = storage.mutedNicks.upsert({networkId:network.id,nick:'Alice'});
    receive({id:'quiet'});
    storage.mutedNicks.remove(muted.id);
    const buffer = storage.conversations.getBufferByTarget(network.id,'#chat')!;
    assert.ok(buffer.unread > 1);
    bridge.applySocketMessage({type:'buffer.upsert',buffer,sync:{epoch:'test',revision:3}});
    bridge.applySocketMessage(ready(3));
    assert.equal(arrivals.length,1);
    // A missing revision enters recovery; snapshot contents are never replayed as arrivals.
    bridge.applySocketMessage({...event,sync:{epoch:'test',revision:5}});
    bridge.applySocketMessage(ready(5));
    bridge.applySocketMessage({...event,sync:{epoch:'test',revision:5}});
    assert.equal(arrivals.length,1);
    unsubscribe();
    bridge.applySocketMessage({...event,sync:{epoch:'test',revision:6}});
    assert.equal(arrivals.length,1);
  } finally { runtime.gateway.close(); storage.close(); }
});
