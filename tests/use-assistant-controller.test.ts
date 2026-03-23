import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantContextLabel,
  isAssistantBusy,
  isAssistantThreadLoading,
  shouldAutoLoadAssistantThread,
} from '../web/src/useAssistantController.js';

test('assistant loading stays false when no thread is selected', () => {
  assert.equal(isAssistantThreadLoading(null, null), false);
  assert.equal(isAssistantThreadLoading(null, 'thread-1'), false);
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

test('assistant context label includes network identity for duplicate targets', () => {
  assert.equal(assistantContextLabel({
    mode: 'channel-connected',
    selection: { kind: 'buffer', bufferId: 'buffer-1' },
    connectionInstances: [],
    selectedNetwork: {
      id: 'network-2',
      templateId: null,
      managerHidden: true,
      name: 'OtherNet',
      host: 'irc.other.example',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: [],
      username: 'tester',
      realName: 'Tester',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    selectedRuntime: null,
    selectedBuffer: {
      id: 'buffer-1',
      networkId: 'network-2',
      kind: 'channel',
      target: '#general',
      unread: 0,
    },
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: '#general',
    headerSubtitle: '',
    composerMode: 'normal',
    composerPlaceholder: '',
    emptyBody: '',
    showNicklist: true,
  }), 'OtherNet · #general · last 50 messages');
});
