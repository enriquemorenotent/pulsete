import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AiAssistantConversation } from '../../web/src/AiAssistantConversation.js';
import { WorkspaceRightSidebar, type WorkspaceRightSidebarProps } from '../../web/src/WorkspaceRightSidebar.js';
import { AssistantReadingModeContext } from '../../web/src/assistant-reading-mode.js';
import type { AssistantEntry } from '../../web/src/AiAssistantChatTypes.js';
import '../../web/src/globals.css';

const entries: AssistantEntry[] = [1, 2].map(id => ({
  id, role: 'assistant', text: `Answer ${id} cites a specific message [S1].`,
  context: {
    buffer: { id: `buffer-${id}`, networkId: 'network', kind: 'channel', target: '#test' },
    messages: [],
    sources: [{ label: 'S1', message: {
      id: `message-${id}`, bufferId: `buffer-${id}`, networkId: 'network', target: '#test',
      ts: 1700000000000, kind: 'line', nick: 'reader', self: false, body: `Saved excerpt ${id}`,
    } }],
  },
}));

function Fixture() {
  const [outcome, setOutcome] = useState('success');
  const [calls, setCalls] = useState<string[]>([]);
  return <main className="p-8" style={{ width: 900 }}>
    <h1>Assistant sources regression fixture</h1>
    <label>Navigation result <select value={outcome} onChange={event => setOutcome(event.target.value)}>
      <option value="success">Success</option><option value="missing">Missing</option><option value="error">Error</option>
    </select></label>
    <output aria-label="Navigation calls">{JSON.stringify(calls)}</output>
    <section className="flex h-[650px] flex-col">
      <AiAssistantConversation entries={entries} pending={false} pendingLabel="" onUseSuggestion={() => {}}
        onOpenSource={async (bufferId, messageId) => {
          setCalls(calls => [...calls, `${bufferId}/${messageId}`]);
          if (outcome === 'error') throw new Error('Unavailable');
          return outcome === 'success';
        }} />
    </section>
  </main>;
}

function SidebarFixture() {
  const [expanded, setExpanded] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [draft, setDraft] = useState('');
  const buffer = { ...entries[0].context!.buffer, kind: 'query' as const, target: 'Reading group',
    unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null };
  const workspace: WorkspaceRightSidebarProps['workspace'] = {
    mode: 'query-connected', selection: { kind: 'buffer', bufferId: buffer.id },
    workspaceNetworks: [], selectedNetwork: null, selectedRuntime: null, selectedBuffer: buffer,
    selectedChannel: null, selectedPendingChannel: null, headerTitle: buffer.target,
    headerSubtitle: '', composerMode: 'normal', composerPlaceholder: '', emptyBody: '', showNicklist: false,
  };
  return <main className="mx-auto flex h-screen flex-col" style={{ width: expanded ? 540 : 320 }}>
    <AssistantReadingModeContext.Provider value={{ expanded, setExpanded }}>
      <WorkspaceRightSidebar workspace={workspace} nicklist={{
        friends: [], nickEmojis: [], mutedNicks: [], contactNotificationSettings: { contacts: [] },
        contactRuleHandlers: { addFriend: async () => true, mute: async () => true,
          removeFriend: async () => true, toggleNotifications: async () => true, unmute: async () => true },
        externalAvatarsEnabled: false,
        onSaveNickEmoji: async () => true, onSelectNick: () => undefined,
      }} assistant={{ buffer, recentOnly, onRecentOnlyChange: async value => { setRecentOnly(value); return true; },
        onUseSuggestion: setDraft }} />
    </AssistantReadingModeContext.Provider>
    {draft ? <output aria-label="IRC draft">{draft}</output> : null}
  </main>;
}

const lookupDemo = new URLSearchParams(window.location.search).has('lookup');
createRoot(document.getElementById('root')!).render(lookupDemo ? <SidebarFixture /> : <Fixture />);
