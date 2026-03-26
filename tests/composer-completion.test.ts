import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import {
  buildComposerCompletionModel,
  getComposerCompletionResult,
} from '../web/src/composer-completion.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? true,
  name: overrides.name ?? 'TestNet',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? ['tester_', 'tester__'],
  username: overrides.username ?? 'tester',
  realName: overrides.realName ?? 'Tester',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'channel',
  target: overrides.target ?? '#help',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? '',
  users: overrides.users ?? [],
});

const makeWorkspace = (overrides: Partial<WorkspaceView> = {}): WorkspaceView => {
  const selectedNetwork = overrides.selectedNetwork ?? makeNetwork();
  const selectedBuffer = overrides.selectedBuffer ?? makeBuffer();
  return {
    mode: overrides.mode ?? 'channel-connected',
    selection: overrides.selection ?? { kind: 'buffer', bufferId: selectedBuffer.id },
    connectionInstances: overrides.connectionInstances ?? [selectedNetwork],
    selectedNetwork,
    selectedRuntime: overrides.selectedRuntime ?? {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: 'runtimeNick',
    },
    selectedBuffer,
    selectedChannel: overrides.selectedChannel ?? makeChannel(),
    selectedPendingChannel: overrides.selectedPendingChannel ?? null,
    headerTitle: overrides.headerTitle ?? selectedBuffer.target,
    headerSubtitle: overrides.headerSubtitle ?? '',
    composerMode: overrides.composerMode ?? 'normal',
    composerPlaceholder: overrides.composerPlaceholder ?? 'Type a message or /command',
    emptyBody: overrides.emptyBody ?? '',
    showNicklist: overrides.showNicklist ?? true,
  };
};

test('channel completion follows nicklist order and dedupes IRC-case aliases', () => {
  const workspace = makeWorkspace({
    selectedBuffer: makeBuffer({ id: 'channel-1', kind: 'channel', target: '#pulsete' }),
    selectedChannel: makeChannel({
      id: 'channel-1',
      name: '#pulsete',
      users: [
        { nick: 'Alice', mode: 'op' },
        { nick: 'anna', mode: 'voice' },
        { nick: 'ALICE', mode: 'normal' },
        { nick: 'avery', mode: 'normal' },
      ],
    }),
  });

  assert.deepEqual(buildComposerCompletionModel(workspace), {
    enabled: true,
    contextKey: 'channel-1',
    candidates: ['Alice', 'anna', 'avery'],
  });
});

test('query completion includes the peer nick and current live nick', () => {
  const workspace = makeWorkspace({
    mode: 'query-connected',
    selectedBuffer: makeBuffer({ id: 'query-1', kind: 'query', target: 'MissD' }),
    selectedChannel: null,
    showNicklist: false,
    selectedRuntime: {
      phase: 'connected',
      serverName: 'irc.example.test',
      nick: 'sofiaNow',
    },
  });

  assert.deepEqual(buildComposerCompletionModel(workspace), {
    enabled: true,
    contextKey: 'query-1',
    candidates: ['MissD', 'sofiaNow'],
  });
});

test('completion replaces the word at the caret and cycles forward and backward', () => {
  const initial = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    contextKey: 'channel-1',
    direction: 'forward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  assert.deepEqual(initial && {
    draft: initial.draft,
    selectionStart: initial.selectionStart,
    selectionEnd: initial.selectionEnd,
  }, {
    draft: 'hello alice world',
    selectionStart: 'hello alice'.length,
    selectionEnd: 'hello alice'.length,
  });

  const next = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: initial?.selectionStart ?? null,
    selectionEnd: initial?.selectionEnd ?? null,
    session: initial?.session ?? null,
  });

  assert.equal(next?.draft, 'hello anna world');

  const previous = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    contextKey: 'channel-1',
    direction: 'backward',
    draft: next?.draft ?? '',
    selectionStart: next?.selectionStart ?? null,
    selectionEnd: next?.selectionEnd ?? null,
    session: next?.session ?? null,
  });

  assert.equal(previous?.draft, 'hello alice world');
});

test('backward completion starts from the last matching nick', () => {
  const result = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    contextKey: 'channel-1',
    direction: 'backward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  assert.equal(result?.draft, 'hello avery world');
});

test('completion sessions reset when the caret moves or candidates change', () => {
  const initial = getComposerCompletionResult({
    candidates: ['alice', 'anna'],
    contextKey: 'channel-1',
    direction: 'forward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  const caretMoved = getComposerCompletionResult({
    candidates: ['alice', 'anna'],
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: 'hello al'.length,
    selectionEnd: 'hello al'.length,
    session: initial?.session ?? null,
  });

  assert.equal(caretMoved?.draft, 'hello alice world');

  const candidatesChanged = getComposerCompletionResult({
    candidates: ['anna', 'alice'],
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: initial?.selectionStart ?? null,
    selectionEnd: initial?.selectionEnd ?? null,
    session: initial?.session ?? null,
  });

  assert.equal(candidatesChanged?.draft, 'hello alice world');
});

test('completion is a no-op when there is no fragment or no matching candidate', () => {
  assert.equal(
    getComposerCompletionResult({
      candidates: ['alice'],
      contextKey: 'channel-1',
      direction: 'forward',
      draft: 'hello alice world',
      selectionStart: 'hello '.length,
      selectionEnd: 'hello '.length,
      session: null,
    }),
    null,
  );

  assert.equal(
    getComposerCompletionResult({
      candidates: ['alice'],
      contextKey: 'channel-1',
      direction: 'forward',
      draft: 'hello z world',
      selectionStart: 'hello z'.length,
      selectionEnd: 'hello z'.length,
      session: null,
    }),
    null,
  );
});
