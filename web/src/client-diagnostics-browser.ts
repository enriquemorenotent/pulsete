const topMeasureLimit = 30;
const measureCategoryLimit = 200;
const asynchronousDiagnosticTimeoutMs = 20_000;

type MeasureAggregate = {
  count: number;
  maxDurationMs: number;
  name: string;
  totalDurationMs: number;
};

type ChromiumHeapMemory = {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
};

type UserAgentSpecificMemory = {
  bytes: number;
};

type ExtendedPerformance = Performance & {
  memory?: ChromiumHeapMemory;
  measureUserAgentSpecificMemory?: () => Promise<UserAgentSpecificMemory>;
};

type ExtendedNavigator = Navigator & {
  deviceMemory?: number;
};

const knownReactMeasureNames = new Set([
  'Action',
  'Cascading Update',
  'Commit',
  'Errored',
  'Mount',
  'Passive Effects',
  'Promise Resolved',
  'Recovered',
  'Reconnect',
  'Render',
  'Update',
  'Update Blocked',
]);

export const isReactPerformanceMeasureName = (name: string) =>
  name.startsWith('\u200b') || knownReactMeasureNames.has(name);

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const rounded = (value: number) => Math.round(value * 1_000) / 1_000;

const sanitizeComponentName = (name: string) => {
  const sanitized = name
    .replace(/[^\p{L}\p{N}_.$()[\]<>:\- ]+/gu, '?')
    .replace(/\?+/g, '?')
    .slice(0, 100);
  return sanitized || 'anonymous';
};

export const classifyPerformanceMeasureName = (name: string) => {
  if (name.startsWith('\u200b')) {
    return `React component: ${sanitizeComponentName(name.slice(1))}`;
  }
  if (isReactPerformanceMeasureName(name)) {
    return `React: ${name}`;
  }
  return 'Other application/browser measures';
};

export const createPerformanceMeasureAccumulator = (
  categoryLimit = measureCategoryLimit,
) => {
  const byName = new Map<string, MeasureAggregate>();
  let count = 0;
  let maxDurationMs = 0;
  let totalDurationMs = 0;

  const record = (entry: Pick<PerformanceEntry, 'duration' | 'name'>) => {
    const duration = Math.max(0, finiteNumber(entry.duration));
    let name = classifyPerformanceMeasureName(entry.name);
    if (!byName.has(name) && byName.size >= categoryLimit) {
      name = 'Additional measure categories';
    }
    const aggregate = byName.get(name) ?? {
      count: 0,
      maxDurationMs: 0,
      name,
      totalDurationMs: 0,
    };
    aggregate.count += 1;
    aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, duration);
    aggregate.totalDurationMs += duration;
    byName.set(name, aggregate);
    count += 1;
    maxDurationMs = Math.max(maxDurationMs, duration);
    totalDurationMs += duration;
  };

  const snapshot = () => {
    const aggregates = Array.from(byName.values(), (aggregate) => ({
      ...aggregate,
      maxDurationMs: rounded(aggregate.maxDurationMs),
      totalDurationMs: rounded(aggregate.totalDurationMs),
    }));
    return {
      count,
      maxDurationMs: rounded(maxDurationMs),
      totalDurationMs: rounded(totalDurationMs),
      topByCount: [...aggregates]
        .sort((left, right) => right.count - left.count)
        .slice(0, topMeasureLimit),
      topByTotalDuration: [...aggregates]
        .sort((left, right) => right.totalDurationMs - left.totalDurationMs)
        .slice(0, topMeasureLimit),
    };
  };

  return {
    get count() {
      return count;
    },
    record,
    snapshot,
  };
};

export const readChromiumHeapMemory = () => {
  if (typeof performance === 'undefined') {
    return { status: 'unsupported' as const };
  }
  const memory = (performance as ExtendedPerformance).memory;
  if (!memory) {
    return { status: 'unsupported' as const };
  }
  return {
    status: 'available' as const,
    jsHeapSizeLimitBytes: finiteNumber(memory.jsHeapSizeLimit),
    totalJSHeapSizeBytes: finiteNumber(memory.totalJSHeapSize),
    usedJSHeapSizeBytes: finiteNumber(memory.usedJSHeapSize),
  };
};

export const collectLightweightBrowserSample = () => ({
  documentVisibility: typeof document === 'undefined' ? 'unavailable' : document.visibilityState,
  domElements: typeof document === 'undefined'
    ? null
    : document.getElementsByTagName('*').length,
  jsHeap: readChromiumHeapMemory(),
});

const countDomNodes = (element: Element) => {
  const counts = { comments: 0, text: 0 };
  for (const node of element.childNodes) {
    if (node.nodeType === Node.COMMENT_NODE) {
      counts.comments += 1;
    } else if (node.nodeType === Node.TEXT_NODE) {
      counts.text += 1;
    }
  }
  return counts;
};

const collectDomDiagnostics = () => {
  if (typeof document === 'undefined') {
    return { status: 'unavailable' as const };
  }
  const elements = document.getElementsByTagName('*');
  const byTag = new Map<string, number>();
  let attributes = 0;
  let commentNodes = 0;
  let inlineEventAttributes = 0;
  let inlineStyleAttributes = 0;
  let shadowRoots = 0;
  let textNodes = 0;
  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    attributes += element.attributes.length;
    inlineStyleAttributes += element.hasAttribute('style') ? 1 : 0;
    shadowRoots += element.shadowRoot ? 1 : 0;
    const nodes = countDomNodes(element);
    commentNodes += nodes.comments;
    textNodes += nodes.text;
    for (const attribute of element.attributes) {
      inlineEventAttributes += attribute.name.startsWith('on') ? 1 : 0;
    }
  }
  const canvases = Array.from(document.getElementsByTagName('canvas'));
  const images = Array.from(document.images);
  let accessibleCssRules = 0;
  let inaccessibleStyleSheets = 0;
  for (const styleSheet of document.styleSheets) {
    try {
      accessibleCssRules += styleSheet.cssRules.length;
    } catch {
      inaccessibleStyleSheets += 1;
    }
  }
  return {
    status: 'available' as const,
    elements: elements.length,
    attributes,
    commentNodes,
    textNodes,
    shadowRoots,
    inlineEventAttributes,
    inlineStyleAttributes,
    byTag: Object.fromEntries([...byTag].sort((left, right) => right[1] - left[1])),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    menus: document.querySelectorAll('[role="menu"]').length,
    canvases: {
      count: canvases.length,
      backingPixels: canvases.reduce(
        (total, canvas) => total + canvas.width * canvas.height,
        0,
      ),
    },
    images: {
      count: images.length,
      complete: images.filter((image) => image.complete).length,
      decodedPixels: images.reduce(
        (total, image) => total + image.naturalWidth * image.naturalHeight,
        0,
      ),
    },
    styleSheets: {
      count: document.styleSheets.length,
      accessibleCssRules,
      inaccessible: inaccessibleStyleSheets,
    },
    fonts: 'fonts' in document ? document.fonts.size : null,
  };
};

type ResourceAggregate = {
  count: number;
  decodedBodyBytes: number;
  durationMs: number;
  transferBytes: number;
};

const emptyResourceAggregate = (): ResourceAggregate => ({
  count: 0,
  decodedBodyBytes: 0,
  durationMs: 0,
  transferBytes: 0,
});

const resourceScope = (name: string) => {
  if (name.startsWith('data:')) return 'data-url';
  if (name.startsWith('blob:')) return 'blob-url';
  if (typeof location === 'undefined') return 'unknown';
  try {
    return new URL(name, location.href).origin === location.origin
      ? 'same-origin'
      : 'cross-origin';
  } catch {
    return 'unknown';
  }
};

const collectPerformanceDiagnostics = () => {
  if (typeof performance === 'undefined' || typeof performance.getEntries !== 'function') {
    return { status: 'unavailable' as const };
  }
  const entryCounts: Record<string, number> = {};
  const resourceByInitiator = new Map<string, ResourceAggregate>();
  const resourceByScope = new Map<string, number>();
  const measures = createPerformanceMeasureAccumulator();
  let longTaskCount = 0;
  let longTaskDurationMs = 0;
  let totalEntries = 0;
  for (const entry of performance.getEntries()) {
    totalEntries += 1;
    entryCounts[entry.entryType] = (entryCounts[entry.entryType] ?? 0) + 1;
    if (entry.entryType === 'measure') {
      measures.record(entry);
    } else if (entry.entryType === 'resource') {
      const resource = entry as PerformanceResourceTiming;
      const initiator = resource.initiatorType || 'unknown';
      const aggregate = resourceByInitiator.get(initiator) ?? emptyResourceAggregate();
      aggregate.count += 1;
      aggregate.decodedBodyBytes += finiteNumber(resource.decodedBodySize);
      aggregate.durationMs += finiteNumber(resource.duration);
      aggregate.transferBytes += finiteNumber(resource.transferSize);
      resourceByInitiator.set(initiator, aggregate);
      const scope = resourceScope(resource.name);
      resourceByScope.set(scope, (resourceByScope.get(scope) ?? 0) + 1);
    } else if (entry.entryType === 'longtask') {
      longTaskCount += 1;
      longTaskDurationMs += finiteNumber(entry.duration);
    }
  }
  return {
    status: 'available' as const,
    timeOrigin: performance.timeOrigin,
    totalEntries,
    entryCounts,
    measures: measures.snapshot(),
    resources: {
      byInitiator: Array.from(resourceByInitiator, ([initiatorType, aggregate]) => ({
        initiatorType,
        ...aggregate,
        durationMs: rounded(aggregate.durationMs),
      })).sort((left, right) => right.count - left.count),
      byScope: Object.fromEntries(resourceByScope),
    },
    longTasks: {
      count: longTaskCount,
      totalDurationMs: rounded(longTaskDurationMs),
    },
    supportedEntryTypes: typeof PerformanceObserver === 'undefined'
      ? []
      : PerformanceObserver.supportedEntryTypes,
  };
};

const collectEnvironmentDiagnostics = () => {
  const environment = (import.meta as ImportMeta & {
    env?: { DEV?: boolean; MODE?: string; PROD?: boolean };
  }).env;
  const browserNavigator = typeof navigator === 'undefined'
    ? null
    : navigator as ExtendedNavigator;
  return {
    build: {
      development: environment?.DEV ?? null,
      mode: environment?.MODE ?? 'unknown',
      production: environment?.PROD ?? null,
    },
    browser: browserNavigator ? {
      deviceMemoryGiB: browserNavigator.deviceMemory ?? null,
      hardwareConcurrency: browserNavigator.hardwareConcurrency,
      maxTouchPoints: browserNavigator.maxTouchPoints,
      userAgent: browserNavigator.userAgent,
    } : null,
    context: {
      crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
      secure: globalThis.isSecureContext ?? false,
      locationProtocol: typeof location === 'undefined' ? null : location.protocol,
      visibility: typeof document === 'undefined' ? null : document.visibilityState,
    },
    screen: typeof window === 'undefined' ? null : {
      devicePixelRatio: window.devicePixelRatio,
      screenHeight: window.screen?.height ?? null,
      screenWidth: window.screen?.width ?? null,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    },
  };
};

const measureUserAgentMemory = async () => {
  if (typeof performance === 'undefined') {
    return { status: 'unsupported' as const };
  }
  const measure = (performance as ExtendedPerformance).measureUserAgentSpecificMemory;
  if (!measure) {
    return { status: 'unsupported' as const };
  }
  try {
    const result = await measure.call(performance);
    return { status: 'available' as const, bytes: finiteNumber(result.bytes) };
  } catch (error) {
    return {
      status: 'unavailable' as const,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
  }
};

const estimateBrowserStorage = async () => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { status: 'unsupported' as const };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      status: 'available' as const,
      quotaBytes: estimate.quota ?? null,
      usageBytes: estimate.usage ?? null,
    };
  } catch (error) {
    return {
      status: 'unavailable' as const,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
  }
};

const settleWithin = <T>(operation: Promise<T>) =>
  new Promise<T | { status: 'timed-out' }>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ status: 'timed-out' });
      }
    }, asynchronousDiagnosticTimeoutMs);
    operation.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ status: 'timed-out' });
        }
      },
    );
  });

export const collectBrowserDiagnostics = async () => {
  const environment = collectEnvironmentDiagnostics();
  const chromiumHeap = readChromiumHeapMemory();
  const dom = collectDomDiagnostics();
  const performanceDiagnostics = collectPerformanceDiagnostics();
  const [userAgentSpecificMemory, storage] = await Promise.all([
    settleWithin(measureUserAgentMemory()),
    settleWithin(estimateBrowserStorage()),
  ]);
  return {
    environment,
    memory: {
      chromiumHeap,
      userAgentSpecific: userAgentSpecificMemory,
    },
    dom,
    performance: performanceDiagnostics,
    storage,
  };
};
