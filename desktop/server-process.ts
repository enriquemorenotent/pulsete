import { utilityProcess } from 'electron';
import { join } from 'node:path';
import type { PulseteServerOptions } from '../server/server-app.js';

export type DesktopServer = {
  url: string;
  clientUrl: string;
  close: () => Promise<void>;
};

export const startDesktopServer = (options: PulseteServerOptions, onExit: () => void) =>
  new Promise<DesktopServer>((resolve, reject) => {
    const child = utilityProcess.fork(join(__dirname, 'server-process-entry.cjs'), [], {
      serviceName: 'Pulsete local server',
      stdio: 'inherit',
    });
    let ready = false;
    let closing = false;
    let exited = false;
    let closePromise: Promise<void> | undefined;
    const timeout = setTimeout(() => {
      reject(new Error('Pulsete local server did not start'));
      child.kill();
    }, 60_000);
    child.once('spawn', () => child.postMessage({ type: 'start', options }));
    child.on('message', (message) => {
      if (message?.type !== 'ready' || ready) return;
      ready = true;
      clearTimeout(timeout);
      resolve({
        url: message.url,
        clientUrl: message.clientUrl,
        close: () => {
          if (exited) return Promise.resolve();
          if (!closePromise) {
            closing = true;
            closePromise = new Promise<void>((done) => child.once('exit', () => done()));
            child.postMessage({ type: 'close' });
          }
          return closePromise;
        },
      });
    });
    child.once('exit', (code) => {
      exited = true;
      clearTimeout(timeout);
      if (!ready) reject(new Error(`Pulsete local server exited during startup (${code})`));
      else if (!closing) onExit();
    });
  });
