import { addAbortListener } from 'node:events';
import { Worker } from 'node:worker_threads';
import { join, resolve } from 'node:path';

type Pending = {
  resolve: (value: Float32Array[]) => void;
  reject: (reason: Error) => void;
};

export class AssistantEmbeddingClient {
  private worker: Worker | undefined;
  private starting: Promise<void> | undefined;
  private pending = new Map<number, Pending>();
  private requestId = 0;
  private ready = false;
  private closed = false;

  constructor(private readonly directory: string) {}

  get available() { return this.ready; }

  start() {
    if (this.closed) return Promise.reject(new Error('Embedding encoder closed'));
    if (this.starting) return this.starting;
    const packaged = typeof __dirname === 'string';
    const worker = packaged
      ? new Worker(join(__dirname, 'ai-assistant-embedding-worker.cjs'), {
        workerData: { directory: this.directory }, execArgv: [],
      })
      : new Worker(`require('tsx/cjs'); require(require('node:worker_threads').workerData.entry);`, {
        eval: true, execArgv: [],
        workerData: { directory: this.directory, entry: resolve('server/ai-assistant-embedding-worker.ts') },
      });
    this.worker = worker;
    this.starting = new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = undefined;
        this.ready = false;
        this.starting = undefined;
        reject(error);
        for (const entry of this.pending.values()) entry.reject(error);
        this.pending.clear();
        void worker.terminate();
      };
      worker.on('message', (message: { id?: number; ready?: boolean; embeddings?: Float32Array[]; error?: string }) => {
        if (this.worker !== worker) return;
        if (message.ready) { this.ready = true; worker.unref(); resolve(); return; }
        if (message.id === undefined) { fail(new Error(message.error ?? 'Embedding worker failed')); return; }
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!this.pending.size) worker.unref();
        if (message.embeddings) entry?.resolve(message.embeddings);
        else entry?.reject(new Error(message.error ?? 'Embedding request failed'));
      });
      worker.on('error', fail);
      worker.on('exit', code => fail(new Error(`Embedding worker exited (${code})`)));
    });
    return this.starting;
  }

  async encode(texts: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    await this.start();
    signal?.throwIfAborted();
    const worker = this.worker;
    if (!worker || this.closed) throw new Error('Embedding encoder closed');
    const id = ++this.requestId;
    return new Promise<Float32Array[]>((resolve, reject) => {
      const abort = signal && addAbortListener(signal, () => {
        this.pending.delete(id);
        if (!this.pending.size) worker.unref();
        reject(signal.reason);
      });
      this.pending.set(id, {
        resolve: value => { abort?.[Symbol.dispose](); resolve(value); },
        reject: error => { abort?.[Symbol.dispose](); reject(error); },
      });
      worker.ref();
      worker.postMessage({ id, texts });
    });
  }

  close() {
    this.closed = true;
    const worker = this.worker;
    if (!worker) return;
    worker.postMessage({ close: true });
    const timeout = setTimeout(() => void worker.terminate(), 2_500);
    timeout.unref();
    worker.once('exit', () => clearTimeout(timeout));
  }
}
