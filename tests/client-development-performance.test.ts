import assert from 'node:assert/strict';
import test from 'node:test';
import { clearReactPerformanceMeasures, startDevelopmentPerformanceCleanup } from '../web/src/client-development-performance.js';

test('development cleanup releases React timing details and preserves other measures', () => {
  let entries = ['\u200bChatPane', '\u200bChatPane', 'Update', 'database request']
    .map((name) => ({ name }) as PerformanceEntry);
  const cleared: string[] = [];
  clearReactPerformanceMeasures({
    getEntriesByType: () => entries,
    clearMeasures: (name) => {
      cleared.push(name!);
      entries = entries.filter((entry) => entry.name !== name);
    },
  });
  assert.deepEqual(cleared, ['\u200bChatPane', 'Update']);
  assert.deepEqual(entries.map(({ name }) => name), ['database request']);
});

test('development cleanup sweeps immediately, repeats, and stops on disposal', () => {
  let sweeps = 0;
  let scheduled: TimerHandler | undefined;
  let cancelled: number | undefined;
  const stop = startDevelopmentPerformanceCleanup({
    getEntriesByType: () => { sweeps += 1; return []; },
    clearMeasures: () => {},
  }, {
    setInterval: (callback, delay) => {
      assert.equal(delay, 5_000);
      scheduled = callback;
      return 17;
    },
    clearInterval: (id) => { cancelled = id; },
  });
  assert.equal(sweeps, 1);
  assert.equal(typeof scheduled, 'function');
  (scheduled as () => void)();
  assert.equal(sweeps, 2);
  stop();
  assert.equal(cancelled, 17);
});
