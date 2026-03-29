import assert from 'node:assert/strict';
import test from 'node:test';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import { indexConversationMessages,toConversationMessageKey } from '../web/src/conversation-message-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { emptySnapshot, makeBuffer, makeFriend, makeMessage, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('assistant thread load attempts reset on assistant snapshots', () => {
  const loading = reducer(initialState, {
    type: 'set-assistant-loading-thread',
    threadId: 'thread-1',
  });
  const settled = reducer(loading, {
    type: 'set-assistant-loading-thread',
    threadId: null,
  });
  const refreshed = reducer(settled, {
    type: 'assistant-snapshot',
    assistant: emptySnapshot().assistant,
  });

  assert.equal(loading.transient.assistant.attemptedThreadId, 'thread-1');
  assert.equal(settled.transient.assistant.attemptedThreadId, 'thread-1');
  assert.equal(refreshed.transient.assistant.attemptedThreadId, null);
});

test('assistant thread removal clears loaded history and assistant selection state', () => {
  const state = makeState({
    domain: {
      assistant: {
        ...initialState.domain.assistant,
        activeThreadId: 'thread-1',
        threads: [{
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: null,
          createdAt: 1,
          updatedAt: 1,
        }],
      },
      assistantThreads: {
        'thread-1': {
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: null,
          createdAt: 1,
          updatedAt: 1,
          turns: [],
        },
      },
    },
    transient: {
      assistant: {
        attemptedThreadId: 'thread-1',
        loadingThreadId: 'thread-1',
        selectedThreadId: 'thread-1',
      },
    },
  });

  const nextState = reducer(state, {
    type: 'assistant-thread-removed',
    threadId: 'thread-1',
  });

  assert.equal(nextState.domain.assistant.activeThreadId, null);
  assert.deepEqual(nextState.domain.assistant.threads, []);
  assert.deepEqual(nextState.domain.assistantThreads, {});
  assert.equal(nextState.transient.assistant.attemptedThreadId, null);
  assert.equal(nextState.transient.assistant.loadingThreadId, null);
  assert.equal(nextState.transient.assistant.selectedThreadId, null);
});

test('assistant stop requests clear local busy state for the current thread immediately', () => {
  const state = makeState({
    domain: {
      assistant: {
        ...initialState.domain.assistant,
        threads: [{
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: 'inProgress',
          createdAt: 1,
          updatedAt: 1,
        }],
      },
      assistantThreads: {
        'thread-1': {
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: 'inProgress',
          createdAt: 1,
          updatedAt: 1,
          turns: [{
            id: 'turn-1',
            status: 'inProgress',
            error: null,
            items: [],
          }],
        },
      },
    },
  });

  const nextState = reducer(state, {
    type: 'assistant-thread-stop-requested',
    threadId: 'thread-1',
  });

  assert.equal(nextState.domain.assistant.threads[0]?.turnStatus, 'interrupted');
  assert.equal(nextState.domain.assistantThreads['thread-1']?.turnStatus, 'interrupted');
  assert.equal(nextState.domain.assistantThreads['thread-1']?.turns[0]?.status, 'interrupted');
  assert.equal(nextState.domain.assistantThreads['thread-1']?.turns[0]?.error, null);
});

test('assistant turn updates keep the thread summary and loaded thread in sync', () => {
  const state = makeState({
    domain: {
      assistant: {
        ...initialState.domain.assistant,
        threads: [{
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: null,
          createdAt: 1,
          updatedAt: 1,
        }],
      },
      assistantThreads: {
        'thread-1': {
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: null,
          createdAt: 1,
          updatedAt: 1,
          turns: [],
        },
      },
    },
  });

  const nextState = reducer(state, {
    type: 'assistant-turn-started',
    threadId: 'thread-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });

  assert.equal(nextState.domain.assistant.threads[0]?.turnStatus, 'inProgress');
  assert.equal(nextState.domain.assistantThreads['thread-1']?.turnStatus, 'inProgress');
  assert.equal(nextState.domain.assistantThreads['thread-1']?.turns[0]?.id, 'turn-1');
});

test('assistant item deltas normalize ask-thread reply spacing in the visible thread', () => {
  const state = makeState({
    domain: {
      assistantThreads: {
        'thread-1': {
          id: 'thread-1',
          bufferId: 'buffer-1',
          networkId: 'network-1',
          target: '#help',
          scope: 'buffer',
          title: 'Ask · #help',
          task: 'ask',
          model: 'gpt-5.4',
          turnStatus: 'inProgress',
          createdAt: 1,
          updatedAt: 1,
          turns: [{
            id: 'turn-1',
            status: 'inProgress',
            error: null,
            items: [{
              type: 'agentMessage',
              id: 'item-1',
              text: '',
              phase: null,
              artifact: null,
            }],
          }],
        },
      },
    },
  });

  const nextState = reducer(state, {
    type: 'assistant-item-delta',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    delta: 'Answer:The strongest hotel mention is on 2026-03-23.It looks direct.',
  });

  const item = nextState.domain.assistantThreads['thread-1']?.turns[0]?.items[0];
  assert.equal(item?.type, 'agentMessage');
  assert.equal(
    item?.type === 'agentMessage' && item.text,
    'Answer:\nThe strongest hotel mention is on 2026-03-23. It looks direct.',
  );
});

