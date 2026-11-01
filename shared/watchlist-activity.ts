import type { PresenceStatus } from './protocol-chat.js';

export type ActivityInterval = {
  id: number;
  networkId: string;
  status: PresenceStatus;
  start: number;
  end: number;
  arrival: boolean;
  transport: 'monitor' | 'ison';
};

export type WatchlistActivity = {
  since: number;
  until: number;
  networks: { id: string; name: string }[];
  intervals: ActivityInterval[];
};

export const activityRetentionMs = 30 * 24 * 60 * 60_000;
