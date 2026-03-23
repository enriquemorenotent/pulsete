import type { AssistantRateLimits, AssistantRateLimitWindow } from '../../shared/protocol.js';

type AssistantRateLimitsPanelProps = {
  rateLimitBuckets: AssistantRateLimits[];
  rateLimits: AssistantRateLimits | null;
};

export function AssistantRateLimitsPanel(props: AssistantRateLimitsPanelProps) {
  const buckets = selectVisibleRateLimitBuckets(props.rateLimitBuckets, props.rateLimits);
  if (buckets.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 pt-1">
      <div className="rounded-md border border-border/80 bg-background/70 px-3 py-3">
        <div className="space-y-4">
          {buckets.map((bucket, index) => (
            <div key={bucket.limitId ?? `rate-limit-${index}`} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{formatBucketTitle(bucket, index)}</p>
                <p className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Limits</p>
              </div>
              {toRateLimitRows(bucket).map((row) => (
                <div key={row.label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-muted-foreground">{row.label}</p>
                    <p className="font-medium tabular-nums text-foreground">{row.leftPercent}% left</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={row.leftPercent <= 20 ? 'h-full rounded-full bg-destructive/75' : 'h-full rounded-full bg-primary/80'}
                      style={{ width: `${row.leftPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                    <span>{row.usedPercent}% used</span>
                    <span>{row.resetText ?? 'Reset time unavailable'}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const selectVisibleRateLimitBuckets = (
  buckets: AssistantRateLimits[],
  fallback: AssistantRateLimits | null
) => {
  const source = buckets.length > 0 ? buckets : fallback ? [fallback] : [];
  const visible = source.filter((bucket) => !isSparkBucket(bucket));
  return visible.length > 0 ? visible : source;
};

const isSparkBucket = (bucket: AssistantRateLimits) =>
  `${bucket.limitId ?? ''} ${bucket.limitName ?? ''}`.toLowerCase().includes('spark');

const formatBucketTitle = (bucket: AssistantRateLimits, index: number) => {
  if (bucket.limitName) {
    return bucket.limitName;
  }
  if (bucket.limitId === 'codex') {
    return 'Codex';
  }
  if (bucket.limitId) {
    return bucket.limitId
      .split(/[_-]+/)
      .map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : '')
      .join(' ');
  }
  return index === 0 ? 'Codex' : `Usage bucket ${index + 1}`;
};

const toRateLimitRows = (bucket: AssistantRateLimits) => {
  const rows: Array<{
    label: string;
    leftPercent: number;
    usedPercent: number;
    resetText: string | null;
  }> = [];
  if (bucket.primary) {
    rows.push(toRateLimitRow(bucket.primary));
  }
  if (bucket.secondary) {
    rows.push(toRateLimitRow(bucket.secondary));
  }
  return rows;
};

const toRateLimitRow = (window: AssistantRateLimitWindow) => ({
  label: formatWindowLabel(window),
  leftPercent: Math.max(0, Math.round(100 - window.usedPercent)),
  usedPercent: Math.max(0, Math.round(window.usedPercent)),
  resetText: formatResetAt(window.resetsAt),
});

const formatWindowLabel = (window: AssistantRateLimitWindow) => {
  const minutes = window.windowDurationMins;
  if (minutes === 300) {
    return '5h limit';
  }
  if (minutes === 10_080) {
    return 'Weekly limit';
  }
  if (minutes === null || minutes <= 0) {
    return 'Limit';
  }
  if (minutes < 60) {
    return `${minutes}m limit`;
  }
  if (minutes < 1_440 && minutes % 60 === 0) {
    return `${minutes / 60}h limit`;
  }
  if (minutes === 1_440) {
    return 'Daily limit';
  }
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return days === 7 ? 'Weekly limit' : `${days}d limit`;
  }
  return `${minutes}m limit`;
};

const formatResetAt = (timestamp: number | null) => {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp * 1_000);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = date.getMonth() === now.getMonth();
  const sameDay = date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  if (sameYear && sameMonth && sameDay) {
    return `Resets ${time}`;
  }
  const day = new Intl.DateTimeFormat(undefined, sameYear
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  return `Resets ${time} on ${day}`;
};
