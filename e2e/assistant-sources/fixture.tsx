import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AiAssistantConversation } from '../../web/src/AiAssistantConversation.js';
import { AiAssistantPanel } from '../../web/src/AiAssistantPanel.js';
import type { AssistantEntry } from '../../web/src/AiAssistantChatTypes.js';
import '../../web/src/globals.css';

const entries: AssistantEntry[] = [1, 2].map(id => ({
  id, role: 'assistant', text: `Answer ${id} cites [S1]. Unknown [S9].`,
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
const lookupDemo = new URLSearchParams(window.location.search).has('lookup');
createRoot(document.getElementById('root')!).render(lookupDemo ? (
  <main className="mx-auto flex h-screen w-[320px] flex-col bg-[#202733]">
    <AiAssistantPanel buffer={{ ...entries[0].context!.buffer, unread: 0, priorityUnread: 0,
      lastReadTs: null, lastReadMessageId: null }} onUseSuggestion={() => {}} />
  </main>
) : <Fixture />);
