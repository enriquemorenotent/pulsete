import { startPulseteServer, type PulseteServerHandle } from '../server/server-app.js';

let server: PulseteServerHandle | null = null;
let starting = false;
process.parentPort.on('message', async ({ data }) => {
  try {
    if (data?.type === 'start' && !starting) {
      starting = true;
      server = await startPulseteServer(data.options);
      process.parentPort.postMessage({ type: 'ready', url: server.url, clientUrl: server.clientUrl });
    } else if (data?.type === 'close') {
      await server?.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('Pulsete local server failed', error);
    process.exit(1);
  }
});
