import type { RuntimeDebugMemorySnapshot } from '../../shared/protocol-debug.js';
import type { ClientMemoryDiagnostics } from './memory-diagnostics.js';

export const memorySamplerIntervalMs = 5_000;
export const memorySamplerMaxSamples = 120;

export type MemoryDiagnosticsReport = ClientMemoryDiagnostics & {
  server: RuntimeDebugMemorySnapshot | null;
  serverError: string | null;
};

export type MemoryDiagnosticsSample = MemoryDiagnosticsReport & {
  elapsedMs: number;
  index: number;
};

export const appendMemoryDiagnosticsSample = (
  samples: readonly MemoryDiagnosticsSample[],
  sample: MemoryDiagnosticsSample,
) => [...samples, sample].slice(-memorySamplerMaxSamples);

export const getSampleHeapUsed = (sample: MemoryDiagnosticsSample) =>
  sample.browserHeap.available ? sample.browserHeap.usedJSHeapSize : null;

export const getSampleNativeBytes = (sample: MemoryDiagnosticsSample) =>
  sample.browserNativeMemory.available ? sample.browserNativeMemory.bytes : null;

export const getSampleServerHeapUsed = (sample: MemoryDiagnosticsSample) =>
  sample.server?.process.heapUsed ?? null;
