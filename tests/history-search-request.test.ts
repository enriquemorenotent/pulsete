import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferHistorySearchPayload } from '../shared/protocol.js';
import { runHistorySearchRequest } from '../web/src/history-search-request.js';

const payload: BufferHistorySearchPayload = {
  query: 'needle',
  results: [],
  hasMore: false,
};

test('runHistorySearchRequest applies the current search result', async () => {
  const controller = new AbortController();
  const loaded: BufferHistorySearchPayload[] = [];
  const errors: string[] = [];
  let settled = 0;
  let receivedSignal: AbortSignal | undefined;

  await runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    signal: controller.signal,
    search: async (bufferId, query, init) => {
      assert.equal(bufferId, 'buffer-1');
      assert.equal(query, 'needle');
      receivedSignal = init?.signal ?? undefined;
      return payload;
    },
    isCurrentRequest: () => true,
    onLoaded: (result) => {
      loaded.push(result);
    },
    onError: (message) => {
      errors.push(message);
    },
    onSettled: () => {
      settled += 1;
    },
  });

  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(loaded, [payload]);
  assert.deepEqual(errors, []);
  assert.equal(settled, 1);
});

test('runHistorySearchRequest ignores stale completions', async () => {
  const controller = new AbortController();
  const loaded: BufferHistorySearchPayload[] = [];
  const errors: string[] = [];
  let settled = 0;
  let resolveSearch!: (value: BufferHistorySearchPayload) => void;
  const pendingSearch = new Promise<BufferHistorySearchPayload>((resolve) => {
    resolveSearch = resolve;
  });
  let current = true;

  const searching = runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    signal: controller.signal,
    search: async () => pendingSearch,
    isCurrentRequest: () => current,
    onLoaded: (result) => {
      loaded.push(result);
    },
    onError: (message) => {
      errors.push(message);
    },
    onSettled: () => {
      settled += 1;
    },
  });

  current = false;
  controller.abort();
  resolveSearch(payload);
  await searching;

  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(loaded, []);
  assert.deepEqual(errors, []);
  assert.equal(settled, 0);
});

test('runHistorySearchRequest reports failures for the current search', async () => {
  const errors: string[] = [];

  await runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    signal: new AbortController().signal,
    search: async () => {
      throw new Error('search failed');
    },
    isCurrentRequest: () => true,
    onLoaded: () => {
      throw new Error('loaded should not be called');
    },
    onError: (message) => {
      errors.push(message);
    },
    onSettled: () => undefined,
  });

  assert.deepEqual(errors, ['search failed']);
});
