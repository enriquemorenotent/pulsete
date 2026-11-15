import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { FriendState } from '../../shared/protocol-chat.js';
import type { WatchlistActivity } from '../../shared/watchlist-activity.js';
import { buildActivityStatistics } from '../../shared/watchlist-activity-statistics.js';
import { api } from './client.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { activityHour, WatchlistActivityHeatmap } from './WatchlistActivityHeatmap.js';

export function WatchlistActivityDialog({ friend, onClose }: { friend: FriendState; onClose(): void }) {
  const [data, setData] = useState<WatchlistActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void api.watchlistActivity(friend.id, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setData(result);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load activity');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [friend.id, revision]);
  const stats = useMemo(() => data ? buildActivityStatistics(data, timeZone) : null, [data, timeZone]);
  const date = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[min(760px,calc(100vw-3rem))] gap-4 overflow-y-auto p-5 xl:p-5">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-xl">{friend.nick}</DialogTitle>
            <DialogDescription className="mt-1 text-xs">Watchlist activity · Last 30 days · {timeZone}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Refresh activity" title="Refresh activity" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={`size-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /></Button>
            <Button variant="ghost" size="icon" aria-label="Close activity" title="Close activity" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>
      </DialogHeader>
      {loading && !data ? <p role="status" className="py-12 text-center text-muted-foreground">Loading activity…</p> : error ?
        <p role="alert" className="py-8 text-center text-red-300">{error}. Use Refresh to try again.</p> : stats && data ? <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-white/8 pt-3 text-xs text-muted-foreground">
            {stats.typical ? <span>Usually connects <strong className="font-medium text-emerald-300">{activityHour(stats.typical.hour)}–{activityHour(stats.typical.hour + 1)}</strong></span> : null}
            <span>Last observed online <strong className="font-medium text-foreground">{stats.lastOnline === null ? 'Not yet' : date(stats.lastOnline)}</strong></span>
          </div>
          <section aria-label="Weekly connection pattern">
            <h3 className="mb-3 text-sm font-medium">Weekly pattern</h3>
            <WatchlistActivityHeatmap cells={stats.cells} timeZone={timeZone} />
          </section>
          {stats.observedDays < 7 ? <p className="border-t border-white/8 pt-3 text-xs text-muted-foreground">
            {stats.observedDays === 0 ? 'No history yet. Keep Pulsete connected to learn their pattern.'
              : `Learning their pattern · ${stats.observedDays} of 7 days observed`}
          </p> : null}
        </> : null}
    </DialogContent>
  </Dialog>;
}
