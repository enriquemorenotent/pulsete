import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { App, BrowserWindow } from 'electron';

const maxLogBytes = 2 * 1024 * 1024;
type DiagnosticLog = (event: string, details?: Record<string, unknown>) => void;

function rotateLog(path: string, maxBytes = maxLogBytes) {
  try {
    if (statSync(path).size >= maxBytes) renameSync(path, `${path}.previous`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

// Bootstrap credentials live in URL fragments. Never persist URL parameters.
export function diagnosticText(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/g, (url) => url.split(/[?#]/)[0]!).slice(0, 8_000);
}

export function createDiagnosticLog(directory: string, maxBytes = maxLogBytes): DiagnosticLog {
  const path = join(directory, 'desktop.jsonl');
  return (event, details = {}) => {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      rotateLog(path, maxBytes);
      const safeDetails = Object.fromEntries(Object.entries(details).map(([key, value]) =>
        [key, typeof value === 'string' ? diagnosticText(value) : value]));
      appendFileSync(path, JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, ...safeDetails }) + '\n', { mode: 0o600 });
    } catch {
      // A diagnostics write failure must never prevent the client from starting.
    }
  };
}

export function configureDesktopDiagnostics(app: App) {
  const directory = join(app.getPath('userData'), 'logs');
  const log = createDiagnosticLog(directory);
  log('startup', {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    session: process.env.XDG_SESSION_TYPE,
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform') || 'auto',
    disableGpu: app.commandLine.hasSwitch('disable-gpu'),
  });
  // Capture native Chromium errors too, including Wayland buffer failures that
  // do not cause a GPU process crash. Rotate this file between launches.
  try {
    const chromiumLog = join(directory, 'chromium.log');
    rotateLog(chromiumLog);
    app.commandLine.appendSwitch('enable-logging', 'file');
    app.commandLine.appendSwitch('log-file', chromiumLog);
  } catch { /* Keep startup working if the log directory is unavailable. */ }
  app.on('child-process-gone', (_event, details) => {
    log('child-process-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode });
  });
  app.on('gpu-info-update', () => {
    log('gpu-info', { features: app.getGPUFeatureStatus() });
  });
  app.on('before-quit', () => log('before-quit'));
  process.on('uncaughtExceptionMonitor', (error) => log('main-process-error', { message: error.stack ?? error.message }));
  if (process.platform === 'linux') {
    // A reading after restarting cannot reveal whether VRAM was full at the
    // failure. Keep recent samples alongside the renderer/GPU failure events.
    let sampling = false;
    let unavailable = false;
    const sample = () => {
      if (sampling || unavailable) return;
      sampling = true;
      execFile('nvidia-smi', [
        '--query-gpu=index,driver_version,memory.total,memory.used,memory.free,temperature.gpu',
        '--format=csv,noheader,nounits',
      ], { timeout: 2_000, maxBuffer: 16_384 }, (error, stdout) => {
        sampling = false;
        if (error) { unavailable = true; return; }
        log('nvidia-memory', { columns: 'index,driver,totalMiB,usedMiB,freeMiB,temperatureC', values: stdout.trim() });
      });
    };
    app.once('ready', sample);
    const timer = setInterval(sample, 30_000);
    timer.unref();
    app.once('before-quit', () => clearInterval(timer));
  }
  return log;
}

export function observeDesktopWindow(window: BrowserWindow, log: DiagnosticLog) {
  const contents = window.webContents;
  contents.on('render-process-gone', (_event, details) => {
    log('render-process-gone', { reason: details.reason, exitCode: details.exitCode });
  });
  contents.on('unresponsive', () => log('renderer-unresponsive'));
  contents.on('responsive', () => log('renderer-responsive'));
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (isMainFrame) log('load-failed', { errorCode, errorDescription });
  });
  contents.on('did-finish-load', () => log('page-loaded'));
  contents.on('console-message', (details) => {
    if (details.level === 'error') {
      log('renderer-error', { message: details.message, source: details.sourceId, line: details.lineNumber });
    }
  });
  window.on('closed', () => log('window-closed'));
}
