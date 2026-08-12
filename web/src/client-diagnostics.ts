import type { State } from './app-types.js';
import { triggerFileDownload } from './browser-download.js';
import { collectBrowserDiagnostics } from './client-diagnostics-browser.js';
import { summarizeClientState } from './client-diagnostics-state.js';

type DiagnosticsOptions = {
  now?: () => number;
};

export const captureClientDiagnostics = async (
  state: State,
  options: DiagnosticsOptions = {},
) => {
  const capturedAtMs = (options.now ?? Date.now)();
  return {
    kind: 'pulsete-client-memory-diagnostics',
    schemaVersion: 2,
    capturedAt: new Date(capturedAtMs).toISOString(),
    privacy: {
      includesChatBodies: false,
      includesNamesOrIdentifiers: false,
      includesServerAddresses: false,
      note: 'Only structural counts, sizes, timings, and browser metadata are included.',
    },
    workspace: summarizeClientState(state),
    browser: await collectBrowserDiagnostics(),
    limitations: [
      'Normal web pages cannot create a browser heap snapshot or enumerate detached DOM nodes.',
      'Chromium tab/process memory includes renderer allocations that performance.memory may not report.',
      'Performance-entry details are intentionally never serialized because React development entries can retain component trees and props.',
    ],
  };
};

export const downloadClientDiagnostics = async (state: State) => {
  const report = await captureClientDiagnostics(state);
  const timestamp = report.capturedAt.replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  });
  triggerFileDownload(blob, `pulsete-memory-diagnostics-${timestamp}.json`);
};
