import { randomUUID } from 'node:crypto';
import type { PickDccFile } from '../shared/dcc.js';
import { startPulseteServer, type PulseteServerHandle } from '../server/server-app.js';

let server: PulseteServerHandle | null = null;
let starting = false;
const dialogs = new Map<string, (path: string | null) => void>();
const pickDccFile: PickDccFile = request => new Promise(resolve => {
  const id = randomUUID();
  dialogs.set(id, resolve);
  process.parentPort.postMessage({ type: 'dcc-dialog', id, request });
});
process.parentPort.on('message', async ({ data }) => {
  try {
    if (data?.type === 'dcc-dialog-result') {
      const resolve = dialogs.get(data.id);
      dialogs.delete(data.id);
      resolve?.(typeof data.path === 'string' ? data.path : null);
    } else if (data?.type === 'start' && !starting) {
      starting = true;
      server = await startPulseteServer(data.options, pickDccFile);
      process.parentPort.postMessage({ type: 'ready', url: server.url, clientUrl: server.clientUrl });
    } else if (data?.type === 'close') {
      for (const resolve of dialogs.values()) resolve(null);
      dialogs.clear();
      await server?.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('Pulsete local server failed', error);
    process.exit(1);
  }
});
