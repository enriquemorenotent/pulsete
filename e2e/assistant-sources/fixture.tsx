import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AiAssistantConversation } from '../../web/src/AiAssistantConversation.js';
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
createRoot(document.getElementById('root')!).render(<Fixture />);
