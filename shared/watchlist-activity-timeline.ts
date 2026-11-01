import type { PresenceStatus } from './protocol-chat.js';
import type { WatchlistActivity } from './watchlist-activity.js';

type ActivitySpan = { start: number; end: number; status: PresenceStatus; arrival: boolean };
type Boundary = { at: number; status: PresenceStatus; delta: number; arrival: boolean };
const connected = (status: PresenceStatus | null) => status === 'online' || status === 'away';

// Merge observations before calculating durations: five accounts watching the
// same nick still describe one person's timeline, not five times as much time.
export const combineActivityTimeline = (activity: WatchlistActivity): ActivitySpan[] => {
  const boundaries: Boundary[] = [];
  for (const interval of activity.intervals) {
    const start = Math.max(interval.start, activity.since);
    const end = Math.min(interval.end, activity.until);
    if (end <= start) continue;
    boundaries.push({ at: start, status: interval.status, delta: 1,
      arrival: interval.arrival && interval.start >= activity.since });
    boundaries.push({ at: end, status: interval.status, delta: -1, arrival: false });
  }
  boundaries.sort((left, right) => left.at - right.at);
  const counts = { online: 0, away: 0, offline: 0 };
  const status = (): PresenceStatus | null => counts.online > 0 ? 'online'
    : counts.away > 0 ? 'away' : counts.offline > 0 ? 'offline' : null;
  const spans: ActivitySpan[] = [];
  for (let index = 0; index < boundaries.length;) {
    const at = boundaries[index]!.at;
    const before = status();
    let hasArrival = false;
    // Apply every boundary at this instant together. A connection handoff must
    // not invent a gap, a second arrival, or depend on the input order.
    while (index < boundaries.length && boundaries[index]!.at === at) {
      const boundary = boundaries[index++]!;
      counts[boundary.status] += boundary.delta;
      hasArrival ||= boundary.arrival;
    }
    const after = status();
    const end = boundaries[index]?.at;
    if (after === null || end === undefined) continue;
    spans.push({ start: at, end, status: after,
      arrival: hasArrival && !connected(before) && connected(after) });
  }
  return spans;
};
