import { startPulseteServer } from './server-app.js';

const PORT = Number(process.env.PORT ?? 18487);
const HOST = process.env.HOST ?? '127.0.0.1';

void startPulseteServer({
  assetRoot: process.env.PULSETE_ASSET_ROOT,
  host: HOST,
  port: PORT,
}).then((server) => {
  console.log(`Pulsete server listening on ${server.url}`);
}).catch((error: unknown) => {
  console.error('Failed to start Pulsete server', error);
  process.exitCode = 1;
});
