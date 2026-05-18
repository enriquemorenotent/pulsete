import assert from 'node:assert/strict';
import test from 'node:test';
import { slashIrcClientCommandCompletionCandidates } from '../shared/irc-client-command.js';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol-chat.js';
import { buildComposerCompletionModel } from '../web/src/composer-completion.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
  name: overrides.name ?? 'TestNet',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? ['tester_', 'tester__'],
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
    workspaceNetworks: overrides.workspaceNetworks ?? [selectedNetwork],
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
    composerDisabled: overrides.composerDisabled,
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
        { nick: 'Alice', mode: 'op', away: false },
        { nick: 'anna', mode: 'voice', away: false },
        { nick: 'ALICE', mode: 'normal', away: false },
        { nick: 'avery', mode: 'normal', away: false },
      ],
    }),
  });

  assert.deepEqual(buildComposerCompletionModel(workspace), {
    commandCandidates: slashIrcClientCommandCompletionCandidates,
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
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    enabled: true,
    contextKey: 'query-1',
    candidates: ['MissD', 'sofiaNow'],
  });
});

test('server command mode completion only exposes slash commands', () => {
  const workspace = makeWorkspace({
    mode: 'server-connected',
    selectedBuffer: makeBuffer({ id: 'server-1', kind: 'server', target: 'TestNet' }),
    selectedChannel: null,
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    showNicklist: false,
  });

  assert.deepEqual(buildComposerCompletionModel(workspace), {
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    enabled: true,
    contextKey: 'server-1',
    candidates: [],
  });
});

test('disabled composers do not expose completion candidates', () => {
  assert.deepEqual(buildComposerCompletionModel(makeWorkspace({ composerDisabled: true })), {
    commandCandidates: [],
    enabled: false,
    contextKey: null,
    candidates: [],
  });
});
