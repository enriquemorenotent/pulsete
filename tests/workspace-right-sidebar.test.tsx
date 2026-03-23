import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AssistantSnapshot, AssistantThread, BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { emptyAssistantSnapshot } from '../web/src/assistant-state.js';
import { WorkspaceRightSidebar } from '../web/src/WorkspaceRightSidebar.js';
import type { AssistantPanelProps } from '../web/src/AssistantPanel.js';
import type { DesktopShellNicklistModel } from '../web/src/desktop-shell-model.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
};

const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: network.id,
  kind: 'query',
  target: 'alice',
  unread: 0,
};

const channel: ChannelState = {
  id: channelBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: 'General chat',
  users: [{ nick: 'alice', mode: 'op' }],
};

const assistantThread: AssistantThread = {
  id: 'thread-1',
  bufferId: channelBuffer.id,
  networkId: network.id,
  target: '#general',
  title: 'Ask · #general',
  task: 'ask',
  model: 'gpt-5.4',
  turnStatus: null,
  createdAt: 1,
  updatedAt: 2,
  turns: [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    items: [{
      type: 'agentMessage',
      id: 'item-1',
      text: 'Summary goes here',
      phase: null,
      artifact: null,
    }],
  }],
};

const assistantSnapshot: AssistantSnapshot = {
  ...emptyAssistantSnapshot,
  serviceStatus: 'ready',
  auth: {
    ...emptyAssistantSnapshot.auth,
    account: {
      type: 'chatgpt',
      email: 'tester@example.com',
      planType: 'plus',
    },
  },
  defaultModel: 'gpt-5.4',
  models: [{
    id: 'gpt-5.4',
    displayName: 'gpt-5.4',
    description: '',
    isDefault: true,
    hidden: false,
  }],
  threads: [assistantThread],
};

const assistantProps: AssistantPanelProps = {
  assistant: assistantSnapshot,
  contextKey: 'buffer-channel',
  contextEmpty: false,
  loading: false,
  busy: false,
  thread: assistantThread,
  onSubmitPrompt: async () => true,
  onInterruptTurn: async () => true,
};

const nicklist: DesktopShellNicklistModel = {
  friends: [],
  onAddFriend: async () => true,
  onRemoveFriend: async () => true,
  onSelectNick: () => {},
};

const createWorkspace = (overrides: Partial<WorkspaceView>): WorkspaceView => ({
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: channelBuffer.id },
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: null,
  selectedBuffer: channelBuffer,
  selectedChannel: channel,
  selectedPendingChannel: null,
  headerTitle: '#general',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: 'Type a message',
  emptyBody: '',
  showNicklist: true,
  ...overrides,
});

test('channel workspace renders user and assistant tabs', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={createWorkspace({})}
      nicklist={nicklist}
      assistant={assistantProps}
    />
  );

  assert.match(markup, /Users/);
  assert.match(markup, /Assistant/);
  assert.match(markup, /alice/);
});

test('query workspace renders the assistant panel without sidebar tabs', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={createWorkspace({
        mode: 'query-connected',
        selection: { kind: 'buffer', bufferId: queryBuffer.id },
        selectedBuffer: queryBuffer,
        selectedChannel: null,
        headerTitle: 'alice',
        showNicklist: false,
      })}
      nicklist={nicklist}
      assistant={{
        ...assistantProps,
        contextKey: 'buffer-query',
        thread: null,
      }}
    />
  );

  assert.doesNotMatch(markup, /Assistant/);
  assert.doesNotMatch(markup, /Users/);
  assert.match(markup, /Ask a question\./);
  assert.match(markup, /Send/);
  assert.doesNotMatch(markup, /Threads/);
  assert.doesNotMatch(markup, /Summarize/);
  assert.doesNotMatch(markup, /Draft/);
  assert.doesNotMatch(markup, /Sign out/);
  assert.doesNotMatch(markup, /Default model/);
});
