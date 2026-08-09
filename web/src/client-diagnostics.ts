import type { State } from './app-types.js';
import { triggerFileDownload } from './browser-download.js';
import {
  collectBrowserDiagnostics,
  collectLightweightBrowserSample,
  createPerformanceMeasureAccumulator,
  isReactPerformanceMeasureName,
} from './client-diagnostics-browser.js';
import {
  summarizeClientState,
  summarizeClientStateForSample,
} from './client-diagnostics-state.js';
import type { ClientSocketInstrumentation } from './client-socket.js';

const defaultHistoryCapacity = 360;
const defaultSampleIntervalMs = 10_000;
const activityTypeLimit = 100;

type ActivityCount = {
  characters: number;
  count: number;
  type: string;
};

type RecorderOptions = {
  historyCapacity?: number;
  now?: () => number;
  sampleIntervalMs?: number;
};

export const createBoundedDiagnosticsHistory = <T>(requestedCapacity: number) => {
  const capacity = Math.max(1, Math.floor(requestedCapacity));
  const entries = new Array<T>(capacity);
  let dropped = 0;
  let nextIndex = 0;
  let size = 0;

  const push = (entry: T) => {
    entries[nextIndex] = entry;
    nextIndex = (nextIndex + 1) % capacity;
    if (size < capacity) {
      size += 1;
    } else {
      dropped += 1;
    }
  };

  const values = () => {
    const oldestIndex = (nextIndex - size + capacity) % capacity;
    return Array.from(
      { length: size },
      (_, offset) => entries[(oldestIndex + offset) % capacity]!,
    );
  };

  return {
    capacity,
    get dropped() {
      return dropped;
    },
    get size() {
      return size;
    },
    push,
    values,
  };
};

const recordTypedActivity = (
  activity: Map<string, ActivityCount>,
  type: string,
  characters: number,
) => {
  let key = type;
  if (!activity.has(key) && activity.size >= activityTypeLimit) {
    key = 'additional-types';
  }
  const current = activity.get(key) ?? { characters: 0, count: 0, type: key };
  current.count += 1;
  current.characters += Math.max(0, Math.floor(characters));
  activity.set(key, current);
};

const activityValues = (activity: Map<string, ActivityCount>) =>
  Array.from(activity.values(), (entry) => ({ ...entry }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));

export const createClientDiagnosticsRecorder = (options: RecorderOptions = {}) => {
  const now = options.now ?? Date.now;
  const sampleIntervalMs = Math.max(
    1_000,
    Math.floor(options.sampleIntervalMs ?? defaultSampleIntervalMs),
  );
  const history = createBoundedDiagnosticsHistory(
    options.historyCapacity ?? defaultHistoryCapacity,
  );
  const sessionStartedAtMs = now();
  const storeActivity = new Map<string, ActivityCount>();
  const socketReceivedActivity = new Map<string, ActivityCount>();
  const socketSentActivity = new Map<string, ActivityCount>();
  const observedMeasures = createPerformanceMeasureAccumulator();
  let changedStoreDispatches = 0;
  let activeStoreListeners = 0;
  let activeSockets = 0;
  let closedSockets = 0;
  let createdSockets = 0;
  let invalidSocketPayloads = 0;
  let openedSockets = 0;
  let maxActiveSockets = 0;
  let maxStoreListeners = 0;
  let performanceObserver: PerformanceObserver | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;
  let totalStoreDispatches = 0;

  const snapshotActivity = () => ({
    store: {
      activeListeners: activeStoreListeners,
      changed: changedStoreDispatches,
      dispatched: totalStoreDispatches,
      maxActiveListeners: maxStoreListeners,
      unchanged: totalStoreDispatches - changedStoreDispatches,
      byType: activityValues(storeActivity),
    },
    socket: {
      activeConnections: activeSockets,
      connectionsClosed: closedSockets,
      connectionsCreated: createdSockets,
      connectionsOpened: openedSockets,
      invalidPayloads: invalidSocketPayloads,
      maxActiveConnections: maxActiveSockets,
      received: activityValues(socketReceivedActivity),
      sent: activityValues(socketSentActivity),
    },
    performanceMeasuresObserved: observedMeasures.snapshot(),
  });

  const createSample = (state: State) => {
    const sampledAtMs = now();
    return {
      at: new Date(sampledAtMs).toISOString(),
      sessionElapsedMs: Math.max(0, sampledAtMs - sessionStartedAtMs),
      browser: collectLightweightBrowserSample(),
      workspace: summarizeClientStateForSample(state),
      activityTotals: {
        performanceMeasures: observedMeasures.count,
        socketReceived: Array.from(socketReceivedActivity.values()).reduce(
          (total, entry) => total + entry.count,
          0,
        ),
        socketSent: Array.from(socketSentActivity.values()).reduce(
          (total, entry) => total + entry.count,
          0,
        ),
        storeListeners: activeStoreListeners,
        storeDispatches: totalStoreDispatches,
      },
    };
  };

  const observePerformanceMeasures = () => {
    if (typeof PerformanceObserver === 'undefined' || performanceObserver) {
      return;
    }
    try {
      performanceObserver = new PerformanceObserver((list) => {
        const reactMeasureNames = new Set<string>();
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            observedMeasures.record(entry);
            if (isReactPerformanceMeasureName(entry.name)) {
              reactMeasureNames.add(entry.name);
            }
          }
        }
        if (typeof performance !== 'undefined'
          && typeof performance.clearMeasures === 'function') {
          for (const name of reactMeasureNames) {
            try {
              performance.clearMeasures(name);
            } catch {
              // Diagnostics cleanup must never interfere with the client.
            }
          }
        }
      });
      performanceObserver.observe({ type: 'measure', buffered: true });
    } catch {
      performanceObserver?.disconnect();
      performanceObserver = null;
    }
  };

  const stop = () => {
    if (sampleTimer !== null) {
      clearInterval(sampleTimer);
      sampleTimer = null;
    }
    performanceObserver?.disconnect();
    performanceObserver = null;
  };

  const start = (getState: () => State) => {
    stop();
    observePerformanceMeasures();
    history.push(createSample(getState()));
    sampleTimer = setInterval(() => {
      try {
        history.push(createSample(getState()));
      } catch {
        // Diagnostics must never interfere with the client.
      }
    }, sampleIntervalMs);
    return stop;
  };

  const recordStoreDispatch = (type: string, changed: boolean) => {
    totalStoreDispatches += 1;
    changedStoreDispatches += changed ? 1 : 0;
    recordTypedActivity(storeActivity, type, 0);
  };

  const recordStoreListenerCount = (listenerCount: number) => {
    activeStoreListeners = Math.max(0, Math.floor(listenerCount));
    maxStoreListeners = Math.max(maxStoreListeners, activeStoreListeners);
  };

  const socketInstrumentation: ClientSocketInstrumentation = {
    onClose() {
      closedSockets += 1;
      activeSockets = Math.max(0, activeSockets - 1);
    },
    onCreate() {
      createdSockets += 1;
      activeSockets += 1;
      maxActiveSockets = Math.max(maxActiveSockets, activeSockets);
    },
    onInvalidReceive(payloadCharacters) {
      invalidSocketPayloads += 1;
      recordTypedActivity(socketReceivedActivity, 'invalid-payload', payloadCharacters);
    },
    onOpen() {
      openedSockets += 1;
    },
    onReceive(type, payloadCharacters) {
      recordTypedActivity(socketReceivedActivity, type, payloadCharacters);
    },
    onSend(type, payloadCharacters) {
      recordTypedActivity(socketSentActivity, type, payloadCharacters);
    },
  };

  const capture = async (state: State) => {
    const capturedAtMs = now();
    const currentSample = createSample(state);
    history.push(currentSample);
    const browser = await collectBrowserDiagnostics();
    return {
      kind: 'pulsete-client-memory-diagnostics',
      schemaVersion: 1,
      capturedAt: new Date(capturedAtMs).toISOString(),
      privacy: {
        includesChatBodies: false,
        includesNamesOrIdentifiers: false,
        includesServerAddresses: false,
        note: 'Only structural counts, sizes, timings, browser metadata, and fixed event types are included.',
      },
      session: {
        startedAt: new Date(sessionStartedAtMs).toISOString(),
        elapsedMs: Math.max(0, capturedAtMs - sessionStartedAtMs),
        sampling: {
          capacity: history.capacity,
          dropped: history.dropped,
          intervalMs: sampleIntervalMs,
          retained: history.size,
        },
      },
      currentSample,
      history: history.values(),
      activity: snapshotActivity(),
      workspace: summarizeClientState(state),
      browser,
      limitations: [
        'Normal web pages cannot create a browser heap snapshot or enumerate detached DOM nodes.',
        'Chromium tab/process memory includes renderer allocations that performance.memory may not report.',
        'Performance-entry details are intentionally never serialized because React development entries can retain component trees and props.',
      ],
    };
  };

  const download = async (state: State) => {
    const report = await capture(state);
    const timestamp = report.capturedAt.replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    triggerFileDownload(blob, `pulsete-memory-diagnostics-${timestamp}.json`);
  };

  return {
    capture,
    download,
    recordStoreDispatch,
    recordStoreListenerCount,
    socketInstrumentation,
    start,
    stop,
  };
};

export type ClientDiagnosticsRecorder = ReturnType<typeof createClientDiagnosticsRecorder>;
