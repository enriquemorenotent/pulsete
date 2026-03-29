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

test('assistant tab renders deterministic evidence from retrieval metadata instead of model labels', () => {
  const evidenceThread: AssistantThread = {
    ...assistantThread,
    turns: [{
      id: 'turn-evidence',
      status: 'completed',
      error: null,
      routing: {
        retrievals: [{
          subject: {
            bufferId: 'buffer-query',
            networkId: network.id,
            target: 'alice',
            title: 'alice',
          },
          request: {
            operation: 'fts_search',
            limit: 5,
            query: 'hotel',
            searchTerms: ['hotel'],
          },
          stage: 'fts_search',
          query: 'hotel',
          confidence: 0.8,
          scoreSummary: 'hits=1',
          context: 'Retrieved transcript context for alice',
          matchCount: 1,
          matchedMessageIds: ['msg-1'],
          windowMessageIds: [['msg-1', 'msg-2']],
          evidenceMessageIds: ['msg-1', 'msg-2'],
          evidenceGroups: [{
            heading: '2026-03-23',
            lines: [
              {
                messageId: 'msg-1',
                speakerRole: 'peer',
                speakerNick: 'alice',
                attributionConfidence: 'high',
                body: '"That would be our bed, only for us 2."',
                kind: 'line',
              },
              {
                messageId: 'msg-2',
                speakerRole: 'self',
                speakerNick: 'tester',
                attributionConfidence: 'high',
                body: '"My other marital bed."',
                kind: 'line',
              },
            ],
          }],
        }],
      },
      items: [{
        type: 'agentMessage',
        id: 'item-evidence',
        text: 'Answer:\nThe hotel fantasy is on March 23, 2026.\n\nEvidence:\n- 2026-03-23\nYou: "wrong attribution"',
        phase: null,
        artifact: null,
      }],
    }],
  };

  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={createWorkspace({})}
      nicklist={nicklist}
      assistant={{
        ...assistantProps,
        thread: evidenceThread,
      }}
      initialTab="assistant"
    />
  );

  assert.match(markup, /The hotel fantasy is on March 23, 2026\./);
  assert.match(markup, /2026-03-23/);
  assert.match(markup, /alice: <\/span>&quot;That would be our bed, only for us 2\.&quot;/);
  assert.match(markup, /You: <\/span>&quot;My other marital bed\.&quot;/);
  assert.doesNotMatch(markup, /wrong attribution/);
});
