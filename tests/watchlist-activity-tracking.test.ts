import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage, makeStorageFile } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { RuntimeWatchlistActivity } from '../server/runtime-watchlist-activity.js';
import { activityRetentionMs } from '../shared/watchlist-activity.js';

const minute = 60_000;
const setup = () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput());
  const friend = storage.friends.upsert({ nick: 'Alice' });
  let now = Date.UTC(2026, 9, 1);
  const tracker = new RuntimeWatchlistActivity(storage.friends, storage.networks, () => now, false);
  const advance = (ms: number) => {
    while (ms > 0) { const step = Math.min(ms, 30_000); now += step; tracker.tick(); ms -= step; }
  };
  const observe = (status: 'online' | 'away' | 'offline', transport: 'ison' | 'monitor' = 'monitor', networkId = network.id) =>
    tracker.route({ type: 'friend-observation', networkId, presences: { aLICE: status }, transport });
  return { file, storage, network, friend, tracker, advance, observe, now: () => now, jump: (ms: number) => { now += ms; } };
};

test('observed offline-to-online arrivals are deduplicated and away remains connected', () => {
  const c = setup();
  try {
    c.observe('offline'); c.advance(minute); c.observe('online');
    c.advance(minute); c.observe('online'); c.advance(minute); c.observe('away'); c.advance(minute);
    const rows = c.tracker.read(c.friend.id).intervals;
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => [row.status, row.end - row.start, row.arrival]), [
      ['offline', minute, false], ['online', minute * 2, true], ['away', minute, false],
    ]);
  } finally { c.tracker.close(); c.storage.close(); }
});

test('disconnects, observation loss, and sleep leave gaps and do not manufacture arrivals', () => {
  const c = setup();
  try {
    c.observe('online'); c.advance(minute);
    c.tracker.clearNetwork(c.network.id); c.advance(minute * 10);
    c.observe('online'); c.advance(minute);
    c.jump(minute * 60); c.tracker.tick(); c.observe('online'); c.advance(minute);
    c.tracker.route({ type: 'friend-observation', networkId: c.network.id, presences: {}, transport: null });
    c.advance(minute * 10); c.observe('online');
    const rows = c.tracker.read(c.friend.id).intervals;
    assert.equal(rows.length, 4);
    assert.equal(rows.filter((row) => row.arrival).length, 0);
    assert.equal(rows.reduce((sum, row) => sum + row.end - row.start, 0), 3 * minute);
  } finally { c.tracker.close(); c.storage.close(); }
});

test('polling expires without replies and resumed observations start a new baseline', () => {
  const c = setup();
  try {
    c.observe('offline', 'ison'); c.advance(minute * 10); c.observe('online', 'ison'); c.advance(minute);
    const rows = c.tracker.read(c.friend.id).intervals;
    assert.equal(rows[0]!.end - rows[0]!.start, minute * 6);
    assert.equal(rows[1]!.arrival, false);
    assert.equal(rows[1]!.start - rows[0]!.end, minute * 4);
  } finally { c.tracker.close(); c.storage.close(); }
});

test('identical nicks on separate networks retain separate histories', () => {
  const c = setup();
  try {
    const other = c.storage.networks.upsert(createNetworkInput({ name: 'Other', host: 'other.test' }));
    c.observe('online'); c.observe('offline', 'monitor', other.id); c.advance(minute);
    const rows = c.tracker.read(c.friend.id).intervals;
    assert.deepEqual(rows.map((row) => [row.networkId, row.status]), [[c.network.id, 'online'], [other.id, 'offline']]);
  } finally { c.tracker.close(); c.storage.close(); }
});

test('restart preserves history without bridging downtime or counting a new arrival', () => {
  const c = setup();
  c.observe('online'); c.advance(minute); c.tracker.close(); c.storage.close();
  c.jump(minute * 60);
  const storage = new Storage(c.file);
  const tracker = new RuntimeWatchlistActivity(storage.friends, storage.networks, c.now, false);
  try {
    tracker.route({ type: 'friend-observation', networkId: c.network.id, presences: { Alice: 'online' }, transport: 'monitor' });
    const rows = tracker.read(c.friend.id).intervals;
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.start - rows[0]!.end, minute * 60);
    assert.equal(rows[1]!.arrival, false);
  } finally { tracker.close(); storage.close(); }
});

test('history is pruned and removing a friend deletes its activity', () => {
  const c = setup();
  try {
    c.observe('online'); c.advance(minute); c.tracker.clearNetwork(c.network.id);
    c.jump(activityRetentionMs + minute); c.tracker.tick();
    assert.equal(c.tracker.read(c.friend.id).intervals.length, 0);
    c.observe('offline'); c.advance(minute);
    c.storage.friends.remove(c.friend.id); c.tracker.tick();
    assert.equal(c.storage.friends.activity.list(c.friend.id, 0).length, 0);
    assert.throws(() => c.tracker.read(c.friend.id), /Friend not found/);
  } finally { c.tracker.close(); c.storage.close(); }
});

test('partial MONITOR replies never use stale nicks as a fresh baseline after a gap', () => {
  const c = setup();
  try {
    const bob = c.storage.friends.upsert({ nick: 'Bob' });
    c.tracker.route({ type: 'friend-observation', networkId: c.network.id, presences: { Alice: 'online', Bob: 'offline' }, transport: 'monitor' });
    c.advance(minute);
    c.jump(minute * 10); c.tracker.tick();
    c.observe('online');
    c.tracker.route({ type: 'friend-observation', networkId: c.network.id, presences: { Bob: 'online' }, transport: 'monitor' });
    const rows = c.tracker.read(bob.id).intervals;
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.arrival, false);
  } finally { c.tracker.close(); c.storage.close(); }
});
