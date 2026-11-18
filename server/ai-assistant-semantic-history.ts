import { setImmediate } from 'node:timers/promises';
import { AssistantEmbeddingClient } from './ai-assistant-embedding-client.js';
import { assistantPassageIndexVersion, embeddingSize } from './ai-assistant-embedding-version.js';
import type { AssistantPassageStore } from './storage-assistant-passages.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';

type Candidate = { ids: string[]; score: number; key: string };
const candidateLimit = 128;
const passageLimit = 30;

export type SemanticHistorySearch = (input: {
  bufferId: string;
  maxRowid: number;
  range: AssistantDateRange | null;
  question: string;
  examples: string[];
  signal: AbortSignal;
}) => Promise<string[][]>;

export class AssistantSemanticHistory {
  private preferredBuffer: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private closed = false;
  private initialized = false;
  private readonly encoder: AssistantEmbeddingClient;

  constructor(private readonly store: AssistantPassageStore, directory: string) {
    this.encoder = new AssistantEmbeddingClient(directory);
  }

  start(bufferId?: string) {
    if (bufferId) this.preferredBuffer = bufferId;
    if (this.running || this.closed) return;
    clearTimeout(this.timer);
    void this.tick();
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.encoder.close();
  }

  search: SemanticHistorySearch = async ({ bufferId, maxRowid, range, question, examples, signal }) => {
    if (this.closed || !this.initialized || !this.encoder.available || signal.aborted || !question.trim()) return [];
    try {
      const texts = [`query: ${question}`, ...examples.map(example => `passage: ${example}`)];
      const vectors = await this.encoder.encode(texts, signal);
      const lists: Candidate[][] = vectors.map(() => []);
      let cursor = { bucket: -1, ordinal: -1 };
      while (!this.closed && !signal.aborted) {
        const rows = this.store.candidates(bufferId, maxRowid, range, cursor);
        if (!rows.length) break;
        for (const row of rows) {
          if (row.embedding.byteLength !== embeddingSize * 4) continue;
          const vector = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, embeddingSize);
          let ids: string[] | undefined;
          for (const [index, query] of vectors.entries()) {
            let score = 0;
            for (let dimension = 0; dimension < embeddingSize; dimension++) score += vector[dimension] * query[dimension];
            const list = lists[index];
            if (list.length === candidateLimit && score <= list.at(-1)!.score) continue;
            ids ??= JSON.parse(row.messageIds) as string[];
            insertCandidate(list, { ids, score, key: `${row.bucket}/${row.ordinal}` });
          }
        }
        cursor = rows.at(-1)!;
        await setImmediate();
      }
      if (this.closed || signal.aborted) return [];
      return fusePassages(lists);
    } catch {
      return [];
    }
  };

  private async tick() {
    this.running = true;
    let interval = 2_500;
    try {
      await this.encoder.start();
      if (this.closed) return;
      if (!this.initialized) {
        this.store.initialize(assistantPassageIndexVersion);
        this.initialized = true;
      }
      const seeded = this.store.seed();
      const job = this.store.nextBucket(this.preferredBuffer);
      if (seeded || job) interval = 5;
      if (!job) return;
      this.store.resetStage();
      let ordinal = 0;
      for (const batch of this.store.passageBatches(job)) {
        const embeddings = await this.encoder.encode(batch.map(({ text }) => `passage: ${text}`));
        if (this.closed || !this.store.saveBatch(job, ordinal, batch, embeddings)) return;
        ordinal += batch.length;
        await setImmediate();
        if (this.closed) return;
      }
      this.store.finish(job);
    } catch (error) {
      if (!this.closed) {
        console.warn('Assistant history indexing paused:', error instanceof Error ? error.message : String(error));
        interval = 60_000;
      }
    } finally {
      this.running = false;
      if (!this.closed) {
        this.timer = setTimeout(() => void this.tick(), interval);
        this.timer.unref();
      }
    }
  }
}

function insertCandidate(list: Candidate[], candidate: Candidate) {
  const position = list.findIndex(({ score }) => score < candidate.score);
  if (position === -1) list.push(candidate);
  else list.splice(position, 0, candidate);
  if (list.length > candidateLimit) list.pop();
}

function fusePassages(lists: Candidate[][]) {
  const combined = new Map<string, { ids: string[]; score: number }>();
  for (const list of lists) {
    list.forEach(({ ids, key }, rank) => {
      const entry = combined.get(key) ?? { ids, score: 0 };
      entry.score += 1 / (61 + rank);
      combined.set(key, entry);
    });
  }
  const ranked = [...combined.values()].sort((first, second) => second.score - first.score);
  const covered = new Set<string>();
  const passages: string[][] = [];
  for (const { ids } of ranked) {
    if (ids.every(id => covered.has(id))) continue;
    passages.push(ids);
    ids.forEach(id => covered.add(id));
    if (passages.length === passageLimit) break;
  }
  return passages;
}
