import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutedNickState, NickEmojiState } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import { ChatTranscriptRow } from './ChatTranscriptRow.js';
import { buildChatTranscriptModel } from './transcript/model.js';
import { buildNickEmojiByNetworkNick } from './nick-emoji-utils.js';
import { defaultMessageDisplayMode } from './message-display-mode.js';
import { handleTranscriptCopy } from './transcript/copy.js';
import type { LogSourceHistoryState } from './LogInspectorDialogBody.js';

export function HistoryTranscriptPane(props: {
  state: LogSourceHistoryState;
  selectedId: string | null;
  bufferId: string | null;
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  loading: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const emojis = useMemo(() => buildNickEmojiByNetworkNick(props.nickEmojis), [props.nickEmojis]);
  const model = useMemo(() => buildChatTranscriptModel({ firstUnreadDividerIndex: null, listKind: 'chat', messages: props.state.messages, mutedNicks: props.mutedNicks, unreadDividerKey: 'history' }), [props.state.messages, props.mutedNicks]);
  const expandedKeys = new Set(expanded);
  for (const row of model.flatRows) {
    if (row.kind === 'muted-group' && row.messageRows.some((item) => item.message.id === props.selectedId)) expandedKeys.add(row.key);
  }
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || props.state.status === 'loading') return;
    if (anchor.current) {
      element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height;
      anchor.current = null;
    }
  }, [props.state.messages, props.state.status]);
  useLayoutEffect(() => { if (!props.loading) anchor.current = null; }, [props.loading]);
  useLayoutEffect(() => {
    if (props.state.status === 'loading') anchor.current = null;
    if (props.state.status === 'loaded' && !props.selectedId && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [props.bufferId, props.selectedId, props.state.status]);
  return <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [overflow-anchor:none]" onCopy={handleTranscriptCopy}>
    {props.state.error ? <p role="alert" className="mb-3 text-sm text-destructive">{props.state.error}</p> : null}
    {props.state.status === 'loading' ? <p role="status" className="text-sm text-muted-foreground">Loading transcript…</p> : !props.bufferId ? <p className="p-6 text-center text-sm text-muted-foreground">Select a conversation to read its history.</p> : <>
      {props.state.hasMore ? <div className="mb-5 flex justify-center"><Button variant="outline" size="sm" disabled={props.loading} onClick={() => { const el = viewport.current; if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop }; props.onLoadOlder(); }}>{props.loading ? 'Loading…' : 'Load older'}</Button></div> : null}
      <div className="space-y-2 text-sm">
        {model.flatRows.flatMap((row) => row.kind === 'server-group' && row.messageRows.some((item) => item.message.id === props.selectedId) ? row.messageRows : [row]).map((row) => <ChatTranscriptRow key={row.key} row={row} channelUserModesByNick={emptyModes} expandedMutedGroupKeys={expandedKeys} highlightedMessageId={props.selectedId} nickEmojiByNetworkNick={emojis} listKind="chat" mode={defaultMessageDisplayMode} onOpenChannel={() => undefined} onToggleMutedGroup={(key) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} participantHighlightMode="none" />)}
      </div>
      {!props.state.messages.length ? <p className="text-sm text-muted-foreground">No saved messages.</p> : null}
      {props.state.hasNewer ? <div className="mt-5 flex justify-center"><Button variant="outline" size="sm" disabled={props.loading} onClick={props.onLoadNewer}>{props.loading ? 'Loading…' : 'Load newer'}</Button></div> : null}
    </>}
  </div>;
}
const emptyModes = new Map();
