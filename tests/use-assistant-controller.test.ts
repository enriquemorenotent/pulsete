import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAskThreads,
  isAssistantBusy,
  isAssistantThreadLoading,
  shouldAutoLoadAssistantThread,
} from '../web/src/useAssistantController.js';

test('assistant loading stays false when no thread is selected', () => {
  assert.equal(isAssistantThreadLoading(null, null), false);
  assert.equal(isAssistantThreadLoading(null, 'thread-1'), false);
});

test('assistant thread filtering keeps all ask threads sorted newest-first', () => {
  const threads = [
    {
      id: 'thread-buffer',
      bufferId: 'buffer-1',
      networkId: 'network-1',
      target: '#general',
      scope: 'buffer' as const,
      title: 'Ask · #general',
      task: 'ask' as const,
      model: 'gpt-5.4',
      turnStatus: null,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: 'thread-free',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free' as const,
      title: 'Chat',
      task: 'ask' as const,
      model: 'gpt-5.4',
      turnStatus: null,
      createdAt: 1,
      updatedAt: 3,
    },
  ];

  assert.deepEqual(
    getAskThreads(threads).map((thread) => thread.id),
    ['thread-free', 'thread-buffer'],
  );
});

test('assistant loading is true only for the selected thread', () => {
  assert.equal(isAssistantThreadLoading('thread-1', null), false);
  assert.equal(isAssistantThreadLoading('thread-1', 'thread-2'), false);
  assert.equal(isAssistantThreadLoading('thread-1', 'thread-1'), true);
});

test('assistant thread auto-load runs only before the first failed attempt for a thread', () => {
  assert.equal(shouldAutoLoadAssistantThread('thread-1', null, null, null), true);
  assert.equal(shouldAutoLoadAssistantThread('thread-1', null, 'thread-1', null), false);
});

test('assistant thread auto-load stays disabled while loading or after the thread is already loaded', () => {
  assert.equal(
    shouldAutoLoadAssistantThread('thread-1', 'thread-1', null, null),
    false,
  );
  assert.equal(
    shouldAutoLoadAssistantThread('thread-1', null, null, {
      id: 'thread-1',
      bufferId: 'buffer-1',
      networkId: 'network-1',
      target: '#general',
      scope: 'buffer',
      title: 'Ask · #general',
      task: 'ask',
      model: 'gpt-5.4',
      turnStatus: null,
      createdAt: 1,
      updatedAt: 1,
      turns: [],
    }),
    false,
  );
});

test('assistant stays busy while the loaded thread summary is still in progress', () => {
  assert.equal(
    isAssistantBusy(
      {
        id: 'thread-1',
        bufferId: 'buffer-1',
        networkId: 'network-1',
        target: '#general',
        scope: 'buffer',
        title: 'Ask · #general',
        task: 'ask',
        model: 'gpt-5.4',
        turnStatus: 'inProgress',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'thread-1',
        bufferId: 'buffer-1',
        networkId: 'network-1',
        target: '#general',
        scope: 'buffer',
        title: 'Ask · #general',
        task: 'ask',
        model: 'gpt-5.4',
        turnStatus: 'inProgress',
        createdAt: 1,
        updatedAt: 1,
        turns: [],
      },
    ),
    true,
  );
});
