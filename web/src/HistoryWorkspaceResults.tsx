import { Button } from '@/components/ui/button.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { highlightSearchText } from './highlight-search-text.js';
import { cn } from '@/lib/utils.js';

export function HistoryWorkspaceResults(props: {
  state: HistorySearchState;
  dirty: boolean;
  names: ReadonlyMap<string, string>;
  selectedId: string | null;
  loadingMore: boolean;
  pageError: string | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
}) {
  if (props.dirty) return <p role="status" className="p-5 text-sm text-muted-foreground">Filters changed. Search to update results.</p>;
  if (props.state.status !== 'loaded') return <p role="status" className="p-5 text-sm text-muted-foreground">{props.state.status === 'loading' ? 'Searching history…' : props.state.error ?? 'Search messages, choose dates, or browse all saved messages.'}</p>;
  if (!props.state.results.length) return <p role="status" className="p-5 text-sm text-muted-foreground">No messages found. Try different words or dates.</p>;
  return <div>
    {props.state.results.map(({ message }) => <button type="button" key={message.id} aria-pressed={message.id === props.selectedId} onClick={() => props.onSelect(message.id)} className={cn('block w-full border-b border-l-4 border-b-border border-l-transparent px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', message.id === props.selectedId ? 'border-l-primary bg-primary/15' : 'hover:bg-accent/50')}>
      <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{message.target}</span><time dateTime={new Date(message.ts).toISOString()} className="shrink-0 text-[11px] text-muted-foreground">{date.format(message.ts)}</time></div>
      <p className="mb-1 truncate text-xs text-muted-foreground">{props.names.get(message.networkId) ?? message.networkId} · {message.nick ?? 'System'}</p>
      <p className="line-clamp-3 break-words text-sm leading-relaxed">{highlightSearchText(message.body, props.state.query)}</p>
    </button>)}
    {props.pageError ? <p role="alert" className="p-3 text-sm text-destructive">{props.pageError}</p> : null}
    {props.state.hasMore ? <div className="sticky bottom-0 border-t border-border bg-background p-3"><Button className="w-full" variant="outline" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? 'Loading…' : 'Load more results'}</Button></div> : <p className="p-3 text-center text-xs text-muted-foreground">All matching messages shown</p>}
  </div>;
}
const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
