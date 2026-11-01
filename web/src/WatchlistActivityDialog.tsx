import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, X } from 'lucide-react';
import type { FriendState } from '../../shared/protocol-chat.js';
import type { WatchlistActivity } from '../../shared/watchlist-activity.js';
import { buildActivityStatistics } from '../../shared/watchlist-activity-statistics.js';
import { api } from './client.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { activityHour, WatchlistActivityHeatmap } from './WatchlistActivityHeatmap.js';

export function WatchlistActivityDialog({ friend, onClose }: { friend: FriendState; onClose(): void }) {
  const [data, setData] = useState<WatchlistActivity | null>(null);
  const [networkId, setNetworkId] = useState('');
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
      setNetworkId((previous) => result.networks.some((network) => network.id === previous) ? previous
        : result.networks.find((network) => result.intervals.some((interval) => interval.networkId === network.id))?.id
          ?? result.networks[0]?.id ?? '');
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load activity');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [friend.id, revision]);
  const stats = useMemo(() => data ? buildActivityStatistics(data, networkId, timeZone) : null, [data, networkId, timeZone]);
  const date = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[min(960px,calc(100vw-3rem))] gap-6 overflow-y-auto p-7 xl:p-7">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300"><Activity className="size-3.5" /> Watchlist activity</div>
            <DialogTitle className="truncate text-2xl">{friend.nick}</DialogTitle>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close activity" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <DialogDescription>When they’re usually connected, based on what Pulsete could observe.</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-4 border-y border-white/8 py-3">
        <label className="flex items-center gap-3 text-xs text-muted-foreground">Network
          <select aria-label="Activity network" value={networkId} onChange={(event) => setNetworkId(event.target.value)} className="max-w-64 rounded-md border border-white/10 bg-[#18212d] px-3 py-2 text-sm text-foreground">
            {!data?.networks.length && <option value="">No networks</option>}
            {data?.networks.map((network) => <option key={network.id} value={network.id}>{network.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>Last 30 days · {timeZone}</span>
          <Button variant="ghost" size="icon" aria-label="Refresh activity" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-3.5" /></Button>
        </div>
      </div>
      {loading && !data ? <p role="status" className="py-12 text-center text-muted-foreground">Loading activity…</p> : error ?
        <p role="alert" className="py-8 text-center text-red-300">{error}. Use Refresh to try again.</p> : stats && data ? <>
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Observation time" value={`${(stats.observedMs / 3_600_000).toFixed(1)} hours`} detail={`${stats.observedDays} days with observations`} />
            <Metric label="Typical connection time" value={stats.typical ? `${activityHour(stats.typical.hour)}–${activityHour(stats.typical.hour + 1)}` : 'Still learning'} detail={stats.typical ? `${stats.typical.count} arrivals in this hour` : 'Needs repeated arrivals across more days'} />
            <Metric label="Last observed online" value={stats.lastOnline === null ? 'Not observed yet' : date(stats.lastOnline)} detail="Includes away status" />
          </div>
          <section className="rounded-xl border border-white/8 bg-black/10 p-5">
            <h3 className="mb-1 text-sm font-medium">Weekly pattern</h3>
            <p className="mb-5 text-xs text-muted-foreground">Share of observed time connected in each hour.</p>
            <WatchlistActivityHeatmap key={networkId} cells={stats.cells} />
          </section>
          {stats.observedDays === 0 ? <p className="text-sm text-muted-foreground">No activity history yet. Keep Pulsete connected to this network to start learning their pattern.</p>
            : stats.observedDays < 7 ? <p className="text-sm text-amber-200/85">Early observations · {stats.observedDays} of 7 days collected. Patterns may change as more data arrives.</p> : null}
          <p className="text-[11px] leading-relaxed text-muted-foreground">{date(data.since)} – {date(data.until)}. Disconnected time is unknown. Polling can delay detection by about 5 minutes; very short sessions may be missed. History is kept for 30 days.</p>
        </> : null}
    </DialogContent>
  </Dialog>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-2 text-base font-medium text-foreground">{value}</p>
    <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
  </div>;
}
