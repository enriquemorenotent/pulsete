import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActivityStatistics } from '../shared/watchlist-activity-statistics.js';
import type { ActivityInterval, WatchlistActivity } from '../shared/watchlist-activity.js';

const hour = 3_600_000;
const start = Date.UTC(2026, 9, 5); // Monday
const interval = (from: number, duration: number, status: ActivityInterval['status'], extras: Partial<ActivityInterval> = {}): ActivityInterval =>
  ({ id: 1, networkId: 'one', status, start: from, end: from + duration, arrival: false, transport: 'monitor', ...extras });
const data = (intervals: ActivityInterval[]): WatchlistActivity => ({ since: start, until: start + 30 * 24 * hour, networks: [], intervals });

test('heatmap measures connected share of observed time and keeps unknown cells empty', () => {
  const result = buildActivityStatistics(data([
    interval(start, hour / 2, 'online'), interval(start + hour / 2, hour / 2, 'offline'),
    interval(start + 7 * 24 * hour, hour, 'away'), interval(start, hour, 'offline', { networkId: 'two' }),
  ]), 'one', 'UTC');
  assert.equal(result.cells[0]!.observedMs, 2 * hour);
  assert.equal(result.cells[0]!.connectedMs, 1.5 * hour);
  assert.equal(result.cells[0]!.awayMs, hour);
  assert.equal(result.cells[1]!.observedMs, 0);
  assert.equal(result.observedDays, 2);
  assert.equal(result.typical, null);
});

test('timezone conversion handles fractional offsets and local day changes', () => {
  const result = buildActivityStatistics(data([interval(start + 23 * hour, hour, 'online')]), 'one', 'Asia/Kathmandu');
  assert.equal(result.cells[24 + 4]!.connectedMs, hour / 4);
  assert.equal(result.cells[24 + 5]!.connectedMs, hour * 3 / 4);
  assert.equal(result.observedDays, 1);
});

test('DST repeated hours accumulate elapsed time rather than losing an hour', () => {
  const from = Date.UTC(2026, 9, 25, 0);
  const result = buildActivityStatistics(data([interval(from, 2 * hour, 'online')]), 'one', 'Europe/Berlin');
  assert.equal(result.cells[6 * 24 + 2]!.connectedMs, 2 * hour);
});

test('statistics clip to the observation window and ignore arrivals before it', () => {
  const result = buildActivityStatistics(data([interval(start - hour, 2 * hour, 'online', { arrival: true })]), 'one', 'UTC');
  assert.equal(result.observedMs, hour);
  assert.equal(result.arrivals, 0);
});

test('typical times require repeated arrivals on separate days and at least seven observed days', () => {
  const rows = Array.from({ length: 7 }, (_, day) => interval(start + day * 24 * hour + 20 * hour, hour, 'online', { arrival: true }));
  const result = buildActivityStatistics(data(rows), 'one', 'UTC');
  assert.equal(result.typical?.hour, 20);
  assert.equal(result.typical?.count, 7);
  assert.equal(buildActivityStatistics(data(rows.slice(0, 3)), 'one', 'UTC').typical, null);
});
