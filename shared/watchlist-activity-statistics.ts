import { combineActivityTimeline } from './watchlist-activity-timeline.js';
import type { WatchlistActivity } from './watchlist-activity.js';

export type ActivityCell = { observedMs: number; connectedMs: number; awayMs: number };
const minuteMs = 60_000;
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const buildActivityStatistics = (activity: WatchlistActivity, timeZone: string) => {
  const cells: ActivityCell[] = Array.from({ length: 168 }, () => ({ observedMs: 0, connectedMs: 0, awayMs: 0 }));
  const days = new Set<string>();
  const arrivals: { hour: number; date: string }[] = [];
  let lastOnline: number | null = null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  });
  const local = (ts: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(ts).map(({ type, value }) => [type, value]));
    return { day: weekdays.indexOf(parts.weekday!), hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
  };
  for (const interval of activity.intervals) {
    if (interval.status !== 'offline' && interval.end >= activity.since && interval.start <= activity.until) {
      lastOnline = Math.max(lastOnline ?? 0, Math.min(interval.end, activity.until));
    }
  }
  for (const interval of combineActivityTimeline(activity)) {
    const start = Math.max(interval.start, activity.since);
    const end = Math.min(interval.end, activity.until);
    if (end < start) continue;
    if (interval.arrival && interval.start >= activity.since && interval.start <= activity.until) {
      const { hour, date } = local(interval.start);
      arrivals.push({ hour, date });
    }
    // Minute boundaries handle DST changes and fractional-hour timezone offsets.
    for (let cursor = start; cursor < end;) {
      const next = Math.min(end, (Math.floor(cursor / minuteMs) + 1) * minuteMs);
      const { day, hour, date } = local(cursor);
      const cell = cells[day * 24 + hour]!;
      const duration = next - cursor;
      cell.observedMs += duration;
      if (interval.status !== 'offline') cell.connectedMs += duration;
      if (interval.status === 'away') cell.awayMs += duration;
      days.add(date);
      cursor = next;
    }
  }
  const arrivalHours = Array.from({ length: 24 }, (_, hour) => ({
    hour, count: arrivals.filter((arrival) => arrival.hour === hour).length,
    days: new Set(arrivals.filter((arrival) => arrival.hour === hour).map((arrival) => arrival.date)).size,
  })).sort((a, b) => b.count - a.count || a.hour - b.hour);
  // Require repeated evidence on separate days before calling a time typical.
  const typical = days.size >= 7 && arrivals.length >= 5 && arrivalHours[0]!.days >= 3
    ? arrivalHours[0]! : null;
  return {
    cells, observedDays: days.size, lastOnline, typical, arrivals: arrivals.length,
    observedMs: cells.reduce((total, cell) => total + cell.observedMs, 0),
    connectedMs: cells.reduce((total, cell) => total + cell.connectedMs, 0),
  };
};
