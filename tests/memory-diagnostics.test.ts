import assert from 'node:assert/strict';
import test from 'node:test';
import { indexConversationMessages } from '../web/src/conversation-message-state.js';
import {
  buildClientMemoryDiagnostics,
  readBrowserHeapSnapshot,
} from '../web/src/memory-diagnostics.js';
import { appendMemoryDiagnosticsSample, memorySamplerMaxSamples } from '../web/src/memory-sampler.js';
import { makeBuffer, makeMessage, makeNetwork, makeState } from './helpers/app-state-test-helpers.js';

test('client memory diagnostics counts retained app state by bucket', () => {
  const channelBuffer = makeBuffer({ id: 'channel-buffer', kind: 'channel', target: '#help' });
  const queryBuffer = makeBuffer({ id: 'query-buffer', kind: 'query', target: 'alice' });
  const messages = [
    makeMessage({ id: 'message-1', bufferId: channelBuffer.id, target: channelBuffer.target, body: 'hello there' }),
    makeMessage({ id: 'message-2', bufferId: channelBuffer.id, target: channelBuffer.target, body: 'another line' }),
    makeMessage({ id: 'message-3', bufferId: queryBuffer.id, target: queryBuffer.target, body: 'private line' }),
  ];
  const state = makeState({
    domain: {
      networks: [makeNetwork()],
      buffers: [channelBuffer, queryBuffer],
      channels: [{
        id: channelBuffer.id,
        networkId: channelBuffer.networkId,
        name: channelBuffer.target,
        topic: '',
        users: [{ nick: 'alice', away: false, mode: 'normal', modes: [] }],
      }],
      friendPresence: { friend: 'online' },
      queryPresence: { [queryBuffer.id]: 'online' },
      messages: indexConversationMessages(messages),
    },
    transient: {
      channelList: {
        open: true,
        networkId: 'network-1',
        requestId: 'request-1',
        status: 'ready',
        entries: [{ name: '#help', users: 1, topic: '' }],
        totalEntries: 1,
        truncated: false,
        error: null,
      },
      historyLoadedByBufferId: { [channelBuffer.id]: true },
      historyHasOlderByBufferId: { [channelBuffer.id]: false },
    },
  });

  const snapshot = buildClientMemoryDiagnostics(state, {
    heapProvider: {
      memory: {
        jsHeapSizeLimit: 300,
        totalJSHeapSize: 200,
        usedJSHeapSize: 100,
      },
    },
    now: new Date('2026-05-06T10:00:00.000Z'),
  });

  assert.equal(snapshot.capturedAt, '2026-05-06T10:00:00.000Z');
  assert.deepEqual(snapshot.browserHeap, {
    available: true,
    jsHeapSizeLimit: 300,
    totalJSHeapSize: 200,
    usedJSHeapSize: 100,
  });
  assert.equal(snapshot.appState.messages, 3);
  assert.equal(snapshot.appState.messageBuckets, 2);
  assert.equal(snapshot.appState.channelUsers, 1);
  assert.equal(snapshot.appState.channelListEntries, 1);
  assert.equal(snapshot.appState.friendPresenceEntries, 1);
  assert.equal(snapshot.appState.queryPresenceEntries, 1);
  assert.equal(typeof snapshot.activity.dispatches, 'number');
  assert.equal(snapshot.browserNativeMemory.available, false);
  assert.equal(snapshot.largestConversations[0]?.bufferId, channelBuffer.id);
  assert.equal(snapshot.largestConversations[0]?.messages, 2);
  assert.ok(snapshot.appState.retainedMessageTextBytes > 0);
});

test('client memory diagnostics reports unavailable browser heap metrics', () => {
  const snapshot = readBrowserHeapSnapshot({});

  assert.equal(snapshot.available, false);
});

test('memory diagnostics sampler retains the newest bounded samples', () => {
  const baseSnapshot = buildClientMemoryDiagnostics(makeState());
  const samples = Array.from({ length: memorySamplerMaxSamples + 1 }, (_, index) => ({
    ...baseSnapshot,
    elapsedMs: index * 1_000,
    index,
    server: null,
    serverError: null,
  })).reduce(appendMemoryDiagnosticsSample, []);

  assert.equal(samples.length, memorySamplerMaxSamples);
  assert.equal(samples[0]?.index, 1);
  assert.equal(samples.at(-1)?.index, memorySamplerMaxSamples);
});
