import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bufferSchema } from '../../shared/protocol-chat.js';
import { AutosaveNotesEditor } from '../../web/src/AutosaveNotesEditor.js';
import { QueryProfileSidebar } from '../../web/src/QueryProfileSidebar.js';
import '../../web/src/globals.css';

const markdown = new URLSearchParams(window.location.search).has('markdown');
const directMessage = bufferSchema.parse({ id: 'a', networkId: 'network', target: 'contact', kind: 'query' });

function Fixture() {
  const [scope, setScope] = useState('buffer:a');
  const [visible, setVisible] = useState(true);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [calls, setCalls] = useState<{ scope: string; value: string; finish: (ok: boolean) => void }[]>([]);
  const save = (value: string) => new Promise<boolean>(resolve => {
    const finish = (ok: boolean) => {
      if (ok) setSaved(current => ({ ...current, [scope]: value }));
      setCalls(current => current.filter(call => call.finish !== finish));
      resolve(ok);
    };
    setCalls(current => [...current, { scope, value, finish }]);
  });
  return <main className="max-w-2xl space-y-5 p-8">
    <h1>Autosave regression fixture</h1>
    <button onClick={() => setScope('buffer:a')}>Conversation</button>{' '}
    <button onClick={() => setScope('network:a')}>Server</button>{' '}
    <button onClick={() => setVisible(value => !value)}>Toggle editor</button>
    <p data-testid="scope">{scope}</p>
    {visible && (markdown ? <div className="w-80 bg-card">
      <QueryProfileSidebar
        buffer={{ ...directMessage, notes: saved[scope] ?? '# Existing\n\n- First item\n- Second item' }}
        onSaveNotes={async (buffer, value) => await save(value) ? { ...buffer, notes: value } : null}
      />
    </div> : <AutosaveNotesEditor id="notes" notes={saved[scope] ?? ''} onSave={save}
      scopeKey={scope} placeholder="Write notes" fill={false} />)}
    <pre data-testid="saved">{JSON.stringify(saved)}</pre>
    <ol>{calls.map((call, index) => <li key={index} data-testid="request">
      <span>{call.scope}: {JSON.stringify(call.value)}</span>
      <button onClick={() => call.finish(true)}>Complete</button>
      <button onClick={() => call.finish(false)}>Fail</button>
    </li>)}</ol>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
