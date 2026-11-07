import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatTranscriptVirtuoso } from '../../web/src/ChatTranscriptVirtuoso.js';
import type { ChatTranscriptModel } from '../../web/src/transcript/model.js';
import '../../web/src/globals.css';

function Fixture() {
  const [tab, setTab] = useState('a');
  const [range, setRange] = useState({ start: 100, end: 350 });
  const [focus, setFocus] = useState({ id: 0, index: null as number | null });
  const [latest, setLatest] = useState(0);
  const [olderLoads, setOlderLoads] = useState(0);
  const [newerLoads, setNewerLoads] = useState(0);
  const [bounded, setBounded] = useState(false);
  const model = useMemo<ChatTranscriptModel>(() => ({
    groups: [], unreadRowIndex: null,
    flatRows: Array.from({ length: range.end - range.start }, (_, index) => {
      const id = range.start + index;
      return { kind: 'message', key: `message-${id}`, hideTimestamp: false,
        message: { id: `message-${id}`, bufferId: tab, networkId: 'test', target: '#test',
          nick: 'reader', body: `Message ${id}: ${'Some text for variable height rows. '.repeat(id % 5 + 1)}`,
          kind: 'line', self: false, ts: 1700000000000 + id * 1000 } };
    }),
  }), [range, tab]);
  const older = async () => {
    setOlderLoads(n => n + 1);
    setRange(r => ({ start: r.start - 50, end: bounded ? r.end - 50 : r.end }));
    return 50;
  };
  const newer = async () => {
    if (range.end >= 350) return 0;
    setNewerLoads(n => n + 1);
    setRange(r => ({ start: r.start + 50, end: r.end + 50 }));
    return 50;
  };
  return <main style={{ width: 900, margin: 20 }}>
    <nav style={{ display: 'flex', gap: 16 }}>
      <button onClick={() => setTab(t => t === 'a' ? 'b' : 'a')}>Switch tab</button>
      <button onClick={() => setRange(r => ({ ...r, end: r.end + 1 }))}>Incoming</button>
      <button onClick={() => void older()}>Older</button>
      <button onClick={() => void newer()}>Newer</button>
      <button onClick={() => setBounded(b => !b)}>Bounded: {String(bounded)}</button>
      <button onClick={() => setFocus(f => ({ id: f.id + 1, index: 100 }))}>Jump</button>
      <button onClick={() => { setRange({ start: 100, end: 350 }); setLatest(n => n + 1); }}>Latest</button>
    </nav>
    <output>Tab {tab}; older {olderLoads}; newer {newerLoads}</output>
    <section style={{ display: 'flex', height: 600 }}>
      <ChatTranscriptVirtuoso key={tab} bufferId={tab} model={model}
        channelUserModesByNick={new Map()} expandedMutedGroupKeys={new Set()}
        nickEmojiByNetworkNick={new Map()} emptyBody="Empty" followOutputRequestId={0}
        focusRequestId={focus.id} focusRowIndex={focus.index} initialScrollTarget="latest"
        jumpToLatestRequestId={latest} listKind="chat" mode="colors"
        onOpenChannel={() => {}} onToggleMutedGroup={() => {}} participantHighlightMode="none"
        onLoadOlderHistory={older} onLoadNewerHistory={range.end < 350 ? newer : undefined}
        hasNewerHistory={range.end < 350} />
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
