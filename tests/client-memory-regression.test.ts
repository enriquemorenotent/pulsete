import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import type { State } from '../web/src/app-types.js';
import {
  globalConversationMessageLimit,
  inactiveConversationMessageLimit,
  selectedConversationMessageLimit,
} from '../web/src/conversation-message-state.js';
import { makeBuffer, makeMessage, makeState } from './helpers/app-state-test-helpers.js';

const bufferCount = 20;
const gcWorkloadSize = 100_000;
const regularWorkloadSize = 20_000;
const selectionRotationInterval = 20_000;
const retentionCheckInterval = 5_000;
const upsertInterval = 16;
const postGcHeapDeltaLimit = 32 * 1024 * 1024;
const collectGarbage = (globalThis as typeof globalThis & { gc?: () => void }).gc;

type TrafficResult = {
  peakHeapBytes: number;
  selectedBufferId: string;
  state: State;
};

test('sustained reducer message traffic has bounded retention and post-GC heap', (context) => {
  let warmup: TrafficResult | null = runMessageTraffic(retentionCheckInterval);
  assertRetentionBounds(warmup.state, warmup.selectedBufferId);
  warmup = null;

  forceGarbageCollection();
  const baselineHeapBytes = process.memoryUsage().heapUsed;
  const messageCount = collectGarbage ? gcWorkloadSize : regularWorkloadSize;
  const startedAt = performance.now();
  const result = runMessageTraffic(messageCount);
  const elapsedMs = performance.now() - startedAt;

  assertRetentionBounds(result.state, result.selectedBufferId);
  forceGarbageCollection();
  const postGcHeapBytes = process.memoryUsage().heapUsed;
  const postGcHeapDelta = postGcHeapBytes - baselineHeapBytes;
  assertRetentionBounds(result.state, result.selectedBufferId);

  if (collectGarbage) {
    assert.ok(
      postGcHeapDelta <= postGcHeapDeltaLimit,
      `post-GC heap grew ${formatMiB(postGcHeapDelta)}; limit is ${formatMiB(postGcHeapDeltaLimit)}`,
    );
  }

  context.diagnostic([
    `messages=${messageCount.toLocaleString('en-US')}`,
    `elapsed=${elapsedMs.toFixed(0)}ms`,
    `peakHeap=${formatMiB(result.peakHeapBytes)}`,
    `postGcDelta=${formatMiB(postGcHeapDelta)}`,
    `gcAssertion=${collectGarbage ? 'enabled' : 'skipped (run npm run test:memory)'}`,
  ].join(' '));
});

const runMessageTraffic = (messageCount: number): TrafficResult => {
  const bufferIds = Array.from({ length: bufferCount }, (_, index) => `memory-buffer-${index}`);
  const buffers = bufferIds.map((id, index) => makeBuffer({
    id,
    kind: 'channel',
    target: `#memory-${index}`,
  }));
  let selectedIndex = 0;
  let selectedBufferId = bufferIds[selectedIndex]!;
  let state = makeState({
    domain: { buffers },
    transient: { selection: { kind: 'buffer', bufferId: selectedBufferId } },
  });
  let peakHeapBytes = process.memoryUsage().heapUsed;

  for (let sequence = 0; sequence < messageCount; sequence += 1) {
    if (sequence > 0 && sequence % selectionRotationInterval === 0) {
      selectedIndex = (selectedIndex + 1) % bufferIds.length;
      selectedBufferId = bufferIds[selectedIndex]!;
      state = reducer(state, {
        type: 'select',
        selection: { kind: 'buffer', bufferId: selectedBufferId },
      });
    }
    const bufferIndex = sequence % bufferIds.length;
    const message = makeMessage({
      id: `memory-message-${sequence}`,
      bufferId: bufferIds[bufferIndex],
      target: `#memory-${bufferIndex}`,
      body: `deterministic memory payload ${sequence.toString(36)}`,
      ts: sequence,
    });
    state = reducer(state, {
      type: 'append-message',
      message,
    });
    if (sequence % upsertInterval === 0) {
      state = reducer(state, {
        type: 'upsert-message',
        message: { ...message, body: `${message.body} edited` },
      });
    }
    if ((sequence + 1) % retentionCheckInterval === 0) {
      assertRetentionBounds(state, selectedBufferId);
      peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
    }
  }
  return { peakHeapBytes, selectedBufferId, state };
};

const assertRetentionBounds = (state: State, selectedBufferId: string) => {
  const entries = Object.entries(state.domain.messages);
  const totalMessages = entries.reduce((sum, [, bucket]) => sum + bucket.length, 0);
  assert.ok(totalMessages <= globalConversationMessageLimit, [
    `retained ${totalMessages} messages`,
    `global limit is ${globalConversationMessageLimit}`,
  ].join('; '));
  for (const [bufferId, bucket] of entries) {
    const limit = bufferId === selectedBufferId
      ? selectedConversationMessageLimit
      : inactiveConversationMessageLimit;
    assert.ok(bucket.length <= limit, `${bufferId} retained ${bucket.length}; limit is ${limit}`);
  }
};

const forceGarbageCollection = () => {
  collectGarbage?.();
  collectGarbage?.();
};

const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
