import { LatestRequest } from '../web/src/latest-request.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferHistorySearchPayload, LogHistorySearchPayload } from '../shared/protocol-chat.js';
import { runHistorySearchRequest, runLogSearchRequest } from '../web/src/history-search-request.js';

const payload: BufferHistorySearchPayload = {
  query: 'needle',
  results: [],
  hasMore: false,
};

test('runHistorySearchRequest applies the current search result', async () => {
  const requests = new LatestRequest();
  const loaded: BufferHistorySearchPayload[] = [];
  const errors: string[] = [];
  let settled = 0;
  let receivedSignal: AbortSignal | undefined;

  await runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    requests,
    search: async (bufferId, query, init) => {
      assert.equal(bufferId, 'buffer-1');
      assert.equal(query, 'needle');
      receivedSignal = init?.signal ?? undefined;
      return payload;
    },
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

  assert.ok(receivedSignal instanceof AbortSignal);
  assert.deepEqual(loaded, [payload]);
  assert.deepEqual(errors, []);
  assert.equal(settled, 1);
});

test('runHistorySearchRequest ignores stale completions', async () => {
  const requests = new LatestRequest();
  const loaded: BufferHistorySearchPayload[] = [];
  const errors: string[] = [];
  let settled = 0;
  let resolveSearch!: (value: BufferHistorySearchPayload) => void;
  const pendingSearch = new Promise<BufferHistorySearchPayload>((resolve) => {
    resolveSearch = resolve;
  });

  const searching = runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    requests,
    search: async () => pendingSearch,
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

  requests.cancel();
  resolveSearch(payload);
  await searching;

  assert.equal(requests.pending, false);
  assert.deepEqual(loaded, []);
  assert.deepEqual(errors, []);
  assert.equal(settled, 0);
});

test('runHistorySearchRequest reports failures for the current search', async () => {
  const errors: string[] = [];

  await runHistorySearchRequest({
    bufferId: 'buffer-1',
    query: 'needle',
    requests: new LatestRequest(),
    search: async () => {
      throw new Error('search failed');
    },
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

test('runLogSearchRequest applies global log filters', async () => {
  const requests = new LatestRequest();
  const logPayload: LogHistorySearchPayload = {
    query: 'needle',
    networkId: 'network-1',
    target: '#help',
    results: [],
    hasMore: false,
  };
  const loaded: LogHistorySearchPayload[] = [];
  let receivedSignal: AbortSignal | undefined;

  await runLogSearchRequest({
    filters: { networkId: 'network-1', target: '#help' },
    query: 'needle',
    requests,
    search: async (query, filters, init) => {
      assert.equal(query, 'needle');
      assert.deepEqual(filters, { networkId: 'network-1', target: '#help' });
      receivedSignal = init?.signal ?? undefined;
      return logPayload;
    },
    onLoaded: (result) => {
      loaded.push(result);
    },
    onError: () => {
      throw new Error('error should not be called');
    },
    onSettled: () => undefined,
  });

  assert.ok(receivedSignal instanceof AbortSignal);
  assert.deepEqual(loaded, [logPayload]);
});
