import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from './app-store.js';
import { api } from './client.js';
import { MemoryDiagnosticsDialog } from './MemoryDiagnosticsDialog.js';
import { captureClientMemoryDiagnostics } from './memory-diagnostics.js';
import {
  appendMemoryDiagnosticsSample,
  memorySamplerIntervalMs,
  type MemoryDiagnosticsReport,
  type MemoryDiagnosticsSample,
} from './memory-sampler.js';
import type { AppUiState } from './useAppUiState.js';

type MemoryDiagnosticsDialogContainerProps = {
  ui: AppUiState;
};

export function MemoryDiagnosticsDialogContainer({
  ui,
}: MemoryDiagnosticsDialogContainerProps) {
  const store = useAppStore();
  const sampleIndexRef = useRef(0);
  const sampleRunIdRef = useRef(0);
  const sampleStartTimeRef = useRef(0);
  const sampleTimerRef = useRef<number | null>(null);
  const samplingCapturePendingRef = useRef(false);
  const requestIdRef = useRef(0);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | 'idle'>('idle');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MemoryDiagnosticsReport | null>(null);
  const [samples, setSamples] = useState<MemoryDiagnosticsSample[]>([]);
  const [sampling, setSampling] = useState(false);
  const [samplingPending, setSamplingPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const captureReport = useCallback(async (): Promise<MemoryDiagnosticsReport> => {
    const clientReport = await captureClientMemoryDiagnostics(store.getState());
    try {
      return {
        ...clientReport,
        server: await api.loadMemoryDiagnostics(),
        serverError: null,
      };
    } catch (error) {
      return {
        ...clientReport,
        server: null,
        serverError: error instanceof Error ? error.message : 'Server diagnostics failed',
      };
    }
  }, [store]);

  const refresh = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCopyStatus('idle');
    setLoading(true);
    setServerError(null);

    void captureReport()
      .then((nextReport) => {
        if (requestIdRef.current === requestId) {
          setReport(nextReport);
          setServerError(nextReport.serverError);
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [captureReport]);

  const captureSample = useCallback(async (runId = sampleRunIdRef.current) => {
    if (samplingCapturePendingRef.current) {
      return;
    }
    samplingCapturePendingRef.current = true;
    setSamplingPending(true);
    try {
      const nextReport = await captureReport();
      if (sampleRunIdRef.current !== runId) {
        return;
      }
      const sampleIndex = sampleIndexRef.current + 1;
      sampleIndexRef.current = sampleIndex;
      const sample = {
        ...nextReport,
        elapsedMs: Date.now() - sampleStartTimeRef.current,
        index: sampleIndex,
      };
      setReport(nextReport);
      setServerError(nextReport.serverError);
      setSamples((current) => appendMemoryDiagnosticsSample(current, sample));
    } finally {
      if (sampleRunIdRef.current === runId) {
        samplingCapturePendingRef.current = false;
        setSamplingPending(false);
      }
    }
  }, [captureReport]);

  const stopSampling = useCallback(() => {
    sampleRunIdRef.current += 1;
    if (sampleTimerRef.current !== null) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    setSampling(false);
    setSamplingPending(false);
    samplingCapturePendingRef.current = false;
  }, []);

  const startSampling = useCallback(() => {
    stopSampling();
    setCopyStatus('idle');
    setSamples([]);
    setSampling(true);
    const runId = sampleRunIdRef.current + 1;
    sampleRunIdRef.current = runId;
    sampleIndexRef.current = 0;
    sampleStartTimeRef.current = Date.now();
    void captureSample(runId);
    sampleTimerRef.current = window.setInterval(
      () => void captureSample(runId),
      memorySamplerIntervalMs,
    );
  }, [captureSample, stopSampling]);

  useEffect(() => {
    if (ui.memoryDiagnosticsOpen) {
      refresh();
    } else {
      stopSampling();
    }
  }, [refresh, stopSampling, ui.memoryDiagnosticsOpen]);

  useEffect(() => () => stopSampling(), [stopSampling]);

  const copyReport = useCallback(() => {
    if (!report) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyStatus('failed');
      return;
    }
    void navigator.clipboard.writeText(JSON.stringify({ report, samples }, null, 2))
      .then(() => setCopyStatus('copied'))
      .catch(() => setCopyStatus('failed'));
  }, [report, samples]);

  const logReport = useCallback(() => {
    if (report) {
      console.info('Pulsete memory diagnostics', { report, samples });
    }
  }, [report, samples]);

  return (
    <MemoryDiagnosticsDialog
      copyStatus={copyStatus}
      loading={loading}
      open={ui.memoryDiagnosticsOpen}
      report={report}
      samples={samples}
      sampling={sampling}
      samplingPending={samplingPending}
      serverError={serverError}
      onClose={ui.closeMemoryDiagnostics}
      onCopy={copyReport}
      onLog={logReport}
      onRefresh={refresh}
      onStartSampling={startSampling}
      onStopSampling={stopSampling}
    />
  );
}
