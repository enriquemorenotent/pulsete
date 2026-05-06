export type BrowserHeapProvider = {
  memory?: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<{
    breakdown?: unknown[];
    bytes: number;
  }>;
};

export type BrowserHeapSnapshot =
  | {
      available: true;
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    }
  | {
      available: false;
      reason: string;
    };

export type UserAgentSpecificMemorySnapshot =
  | {
      available: true;
      bytes: number;
      breakdownCount: number;
    }
  | {
      available: false;
      reason: string;
    };

export type DomMemorySnapshot = {
  elements: number;
  images: number;
  nodes: number | null;
};

export const readBrowserHeapSnapshot = (
  provider: BrowserHeapProvider | null | undefined = getBrowserPerformance(),
): BrowserHeapSnapshot => {
  const memory = provider?.memory;
  if (
    typeof memory?.usedJSHeapSize !== 'number'
    || typeof memory.totalJSHeapSize !== 'number'
    || typeof memory.jsHeapSizeLimit !== 'number'
  ) {
    return {
      available: false,
      reason: 'Browser heap metrics are not exposed by this browser',
    };
  }
  return {
    available: true,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    totalJSHeapSize: memory.totalJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize,
  };
};

export const readUserAgentSpecificMemorySnapshot = async (
  provider: BrowserHeapProvider | null | undefined = getBrowserPerformance(),
): Promise<UserAgentSpecificMemorySnapshot> => {
  if (!provider?.measureUserAgentSpecificMemory) {
    return {
      available: false,
      reason: 'Native browser memory metrics are not exposed by this browser',
    };
  }
  try {
    const result = await provider.measureUserAgentSpecificMemory();
    return {
      available: true,
      bytes: result.bytes,
      breakdownCount: Array.isArray(result.breakdown) ? result.breakdown.length : 0,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : 'Native browser memory capture failed',
    };
  }
};

export const summarizeDom = (document: Document | null): DomMemorySnapshot => {
  if (!document) {
    return {
      elements: 0,
      images: 0,
      nodes: null,
    };
  }
  const nodeFilter = document.defaultView?.NodeFilter;
  return {
    elements: document.querySelectorAll('*').length,
    images: document.images.length,
    nodes: nodeFilter ? countNodes(document, nodeFilter.SHOW_ALL) : null,
  };
};

export const getBrowserPerformance = () =>
  typeof performance === 'undefined' ? null : performance as BrowserHeapProvider;

export const getBrowserDocument = () =>
  typeof document === 'undefined' ? null : document;

const countNodes = (document: Document, whatToShow: number) => {
  const walker = document.createTreeWalker(document, whatToShow);
  let nodes = 0;
  while (walker.nextNode()) {
    nodes += 1;
  }
  return nodes;
};
