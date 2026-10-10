import { isReactPerformanceMeasureName } from './client-diagnostics-browser.js';

const cleanupIntervalMs = 5_000;
type Timeline = Pick<Performance, 'getEntriesByType' | 'clearMeasures'>;

// React's development timing details include serialized props. The browser's
// User Timing buffer otherwise keeps every update for the lifetime of the tab.
export const clearReactPerformanceMeasures = (timeline: Timeline) => {
  const names = new Set<string>();
  for (const entry of timeline.getEntriesByType('measure')) {
    if (isReactPerformanceMeasureName(entry.name)) names.add(entry.name);
  }
  for (const name of names) timeline.clearMeasures(name);
};

export const startDevelopmentPerformanceCleanup = (
  timeline: Timeline,
  scheduler: Pick<Window, 'setInterval' | 'clearInterval'>,
) => {
  const clear = () => clearReactPerformanceMeasures(timeline);
  clear();
  const timer = scheduler.setInterval(clear, cleanupIntervalMs);
  return () => scheduler.clearInterval(timer);
};
