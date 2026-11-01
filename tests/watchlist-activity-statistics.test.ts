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
  ]), 'UTC');
  assert.equal(result.cells[0]!.observedMs, 2 * hour);
  assert.equal(result.cells[0]!.connectedMs, 1.5 * hour);
  assert.equal(result.cells[0]!.awayMs, hour);
  assert.equal(result.cells[1]!.observedMs, 0);
  assert.equal(result.observedDays, 2);
  assert.equal(result.typical, null);
});

test('timezone conversion handles fractional offsets and local day changes', () => {
  const result = buildActivityStatistics(data([interval(start + 23 * hour, hour, 'online')]), 'Asia/Kathmandu');
  assert.equal(result.cells[24 + 4]!.connectedMs, hour / 4);
  assert.equal(result.cells[24 + 5]!.connectedMs, hour * 3 / 4);
  assert.equal(result.observedDays, 1);
});

test('DST repeated hours accumulate elapsed time rather than losing an hour', () => {
  const from = Date.UTC(2026, 9, 25, 0);
  const result = buildActivityStatistics(data([interval(from, 2 * hour, 'online')]), 'Europe/Berlin');
  assert.equal(result.cells[6 * 24 + 2]!.connectedMs, 2 * hour);
});

test('statistics clip to the observation window and ignore arrivals before it', () => {
  const result = buildActivityStatistics(data([interval(start - hour, 2 * hour, 'online', { arrival: true })]), 'UTC');
  assert.equal(result.observedMs, hour);
  assert.equal(result.arrivals, 0);
});

test('typical times require repeated arrivals on separate days and at least seven observed days', () => {
  const rows = Array.from({ length: 7 }, (_, day) => interval(start + day * 24 * hour + 20 * hour, hour, 'online', { arrival: true }));
  const result = buildActivityStatistics(data(rows), 'UTC');
  assert.equal(result.typical?.hour, 20);
  assert.equal(result.typical?.count, 7);
  assert.equal(buildActivityStatistics(data(rows.slice(0, 3)), 'UTC').typical, null);
});

test('five accounts observing the same hour count as one hour and one arrival', () => {
  const rows = Array.from({ length: 5 }, (_, account) => [
    interval(start, hour, 'offline', { networkId: `account-${account}` }),
    interval(start + hour, hour, 'online', { networkId: `account-${account}`, arrival: true }),
  ]).flat();
  const result = buildActivityStatistics(data(rows), 'UTC');
  assert.equal(result.observedMs, 2 * hour);
  assert.equal(result.connectedMs, hour);
  assert.equal(result.arrivals, 1);
  assert.equal(result.cells[1]!.observedMs, hour);
  assert.equal(result.cells[1]!.connectedMs, hour);
});

test('online takes precedence over away and offline across connections', () => {
  const result = buildActivityStatistics(data([
    interval(start, 3 * hour, 'offline'),
    interval(start, 2 * hour, 'away', { networkId: 'two' }),
    interval(start, hour, 'online', { networkId: 'three' }),
  ]), 'UTC');
  assert.equal(result.observedMs, 3 * hour);
  assert.equal(result.connectedMs, 2 * hour);
  assert.equal(result.cells[0]!.awayMs, 0);
  assert.equal(result.cells[1]!.awayMs, hour);
  assert.equal(result.cells[2]!.connectedMs, 0);
  assert.equal(result.lastOnline, start + 2 * hour);
});

test('partially overlapping histories merge while truly unobserved gaps stay unknown', () => {
  const result = buildActivityStatistics(data([
    interval(start, 1.5 * hour, 'online'),
    interval(start + hour, hour, 'online', { networkId: 'two' }),
    interval(start + 3 * hour, hour, 'offline', { networkId: 'three' }),
  ]), 'UTC');
  assert.equal(result.observedMs, 3 * hour);
  assert.equal(result.connectedMs, 2 * hour);
  assert.equal(result.cells[2]!.observedMs, 0);
  assert.equal(result.cells[3]!.observedMs, hour);
});

test('delayed arrivals on another account and connection handoffs do not count again', () => {
  const rows = [
    interval(start, hour, 'offline'),
    interval(start + hour, hour, 'online', { arrival: true }),
    interval(start, 1.5 * hour, 'offline', { networkId: 'two' }),
    interval(start + 1.5 * hour, hour, 'online', { networkId: 'two', arrival: true }),
    interval(start, 2.5 * hour, 'offline', { networkId: 'three' }),
    interval(start + 2.5 * hour, hour, 'online', { networkId: 'three', arrival: true }),
  ];
  const forward = buildActivityStatistics(data(rows), 'UTC');
  const reverse = buildActivityStatistics(data([...rows].reverse()), 'UTC');
  assert.equal(forward.arrivals, 1);
  assert.equal(forward.connectedMs, 2.5 * hour);
  assert.deepEqual(reverse, forward);
});

test('a reconnect baseline is not an arrival even when another account observed offline', () => {
  const result = buildActivityStatistics(data([
    interval(start, 2 * hour, 'offline'),
    interval(start + hour, hour, 'online', { networkId: 'two' }),
  ]), 'UTC');
  assert.equal(result.arrivals, 0);
  assert.equal(result.connectedMs, hour);
});
