import { parentPort, workerData } from 'node:worker_threads';
import { loadAssistantEmbeddingModel } from './ai-assistant-embedding-model.js';

const port = parentPort!;
const shutdown = new AbortController();
const model = loadAssistantEmbeddingModel(workerData.directory, shutdown.signal);

port.on('message', async (message: { close: true } | { id: number; texts: string[] }) => {
  if ('close' in message) {
    shutdown.abort();
    await model.catch(() => undefined);
    port.close();
    return;
  }
  if (shutdown.signal.aborted) return;
  try {
    const encode = await model;
    const embeddings = await encode(message.texts);
    port.postMessage({ id: message.id, embeddings }, embeddings.map(embedding => embedding.buffer as ArrayBuffer));
  } catch (error) {
    port.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
});

void model.then(() => {
  if (!shutdown.signal.aborted) port.postMessage({ ready: true });
}).catch(error => {
  if (!shutdown.signal.aborted) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error) });
    port.close();
  }
});
