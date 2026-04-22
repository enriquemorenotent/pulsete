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
  personaNote: '',
};

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: network.id,
  kind: 'query',
  target: 'alice',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const channel: ChannelState = {
  id: channelBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: 'General chat',
  users: [{ nick: 'alice', mode: 'op', away: false }],
};

const assistantThread: AssistantThread = {
  id: 'thread-1',
  bufferId: channelBuffer.id,
  networkId: network.id,
  target: '#general',
  scope: 'buffer',
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
  activeBufferLabel: '#general',
  assistant: assistantSnapshot,
  contextSubtitle: 'Use this thread to ask about #general.',
  contextKey: 'buffer-channel',
  contextTitle: 'Chat',
  loading: false,
  busy: false,
  resolvedSubjectLabel: null,
  subjectPending: false,
  thread: assistantThread,
  onNewChat: async () => true,
  onOpenChannel: () => {},
  onStop: async () => true,
  onSubmitPrompt: async () => true,
};

const nicklist: DesktopShellNicklistModel = {
  friends: [],
  mutedNicks: [],
  onAddFriend: async () => true,
  onAddMutedNick: async () => true,
  onRemoveFriend: async () => true,
  onRemoveMutedNick: async () => true,
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
  assert.doesNotMatch(markup, /Summary goes here/);
});

test('channel workspace can open the assistant tab by default', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={createWorkspace({})}
      nicklist={nicklist}
      assistant={assistantProps}
      initialTab="assistant"
    />
  );

  assert.match(markup, /Users/);
  assert.match(markup, /Assistant/);
  assert.match(markup, /Summary goes here/);
  assert.match(markup, /#general/);
  assert.match(markup, />New chat<\/button>/);
  assert.doesNotMatch(markup, /Owners/);
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
        activeBufferLabel: 'alice',
        contextSubtitle: 'Current buffer: alice. The assistant can look it up if needed.',
        contextKey: 'buffer-query',
        contextTitle: 'Chat',
        thread: null,
      }}
    />
  );

  assert.doesNotMatch(markup, /Users/);
  assert.match(markup, /<p class="text-\[11px\] uppercase tracking-\[0\.14em\] text-muted-foreground">Assistant<\/p>/);
  assert.match(markup, /<p class="truncate text-sm font-medium text-foreground">alice<\/p>/);
  assert.match(markup, /No messages yet for alice\./);
  assert.match(markup, /placeholder="Ask about alice"/);
  assert.match(markup, />Add files<\/button>/);
  assert.match(markup, />Send<\/button>/);
  assert.doesNotMatch(markup, /Stop/);
  assert.doesNotMatch(markup, /Drop files to attach/);
  assert.doesNotMatch(markup, /Current buffer: alice\. The assistant can look it up if needed\./);
  assert.doesNotMatch(markup, /Assistant chat/);
  assert.doesNotMatch(markup, /Threads/);
  assert.doesNotMatch(markup, /Summarize/);
  assert.doesNotMatch(markup, /Draft/);
  assert.doesNotMatch(markup, /Sign out/);
  assert.doesNotMatch(markup, /Default model/);
});

test('server workspace renders the profile sidebar instead of assistant chrome', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={createWorkspace({
        mode: 'server-connected',
        selection: { kind: 'buffer', bufferId: 'buffer-server' },
        selectedBuffer: {
          id: 'buffer-server',
          networkId: network.id,
          kind: 'server',
          target: 'server',
          unread: 0,
          priorityUnread: 0,
          lastReadTs: null,
          lastReadMessageId: null,
        },
        selectedChannel: null,
        headerTitle: 'server',
        showNicklist: false,
      })}
      nicklist={nicklist}
      assistant={assistantProps}
      serverProfile={{
        network: {
          ...network,
          managerHidden: false,
          personaNote: 'White 30yo female\nConfident and playful',
        },
        onEdit: () => {},
      }}
    />
  );

  assert.match(markup, /Profile/);
  assert.match(markup, /Persona/);
  assert.match(markup, /White 30yo female/);
  assert.match(markup, /Confident and playful/);
  assert.match(markup, />Edit<\/button>/);
  assert.doesNotMatch(markup, /New chat/);
  assert.doesNotMatch(markup, /Threads/);
});
