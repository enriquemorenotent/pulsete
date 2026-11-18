import { setImmediate } from 'node:timers/promises';
import { AssistantEmbeddingClient } from './ai-assistant-embedding-client.js';
import type { ModelDownloadProgress } from './ai-assistant-embedding-model.js';
import { assistantPassageIndexVersion, embeddingSize } from './ai-assistant-embedding-version.js';
import type { AssistantIndexProgress } from '../shared/protocol-ai.js';
import type { AssistantPassageStore, Bucket } from './storage-assistant-passages.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';

type Candidate = { ids: string[]; score: number; key: string };
const candidateLimit = 128;
const passageLimit = 30;
type Encoder = Pick<AssistantEmbeddingClient, 'start' | 'available' | 'encode' | 'close'>;

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
  private discoveryCutoff: number | undefined;
  private backlog: Set<string> | undefined;
  private completed = 0;
  private activity: AssistantIndexProgress = { stage: 'idle' };
  private activitySince = 0;
  private readyUntil = 0;
  private readonly encoder: Encoder;

  constructor(private readonly store: AssistantPassageStore, directory: string,
    createEncoder: (directory: string, onDownload: (value: ModelDownloadProgress | null) => void) => Encoder
      = (path, onDownload) => new AssistantEmbeddingClient(path, onDownload)) {
    this.encoder = createEncoder(directory, progress => {
      if (!this.closed) this.setActivity(progress ? { stage: 'downloading', ...progress } : { stage: 'preparing' });
    });
  }

  progress(): AssistantIndexProgress {
    if (this.closed) return { stage: 'idle' };
    const now = Date.now();
    if (this.activity.stage === 'idle' || this.activity.stage === 'ready'
      || (this.activity.stage === 'updating' && now - this.activitySince < 600)) {
      return { stage: now < this.readyUntil ? 'ready' : 'idle' };
    }
    return this.activity;
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
    if (this.closed || this.discoveryCutoff === undefined || !this.encoder.available || signal.aborted || !question.trim()) return [];
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
      if (!this.encoder.available) this.setActivity({ stage: 'preparing' });
      await this.encoder.start();
      if (this.closed) return;
      if (this.discoveryCutoff === undefined) {
        this.store.initialize(assistantPassageIndexVersion);
        this.discoveryCutoff = this.store.historyEnd();
      }
      if (!this.backlog) {
        if (this.store.seed(this.discoveryCutoff)) {
          this.setActivity({ stage: 'preparing' });
          interval = 5;
          return;
        }
        this.backlog = new Set(this.store.pendingSections(Date.now()).map(sectionKey));
      }
      const job = this.store.nextBucket(this.preferredBuffer);
      if (!job) {
        if (this.backlog.size) {
          const pending = new Set(this.store.pendingSections().map(sectionKey));
          for (const key of this.backlog) if (!pending.has(key)) this.backlog.delete(key);
        }
        if (this.backlog.size) this.showBacklogProgress();
        else this.finishActivity();
        return;
      }
      interval = 5;
      if (this.backlog.size) this.showBacklogProgress();
      else this.setActivity({ stage: 'updating' });
      this.store.resetStage();
      let ordinal = 0;
      for (const batch of this.store.passageBatches(job)) {
        const embeddings = await this.encoder.encode(batch.map(({ text }) => `passage: ${text}`));
        if (this.closed || !this.store.saveBatch(job, ordinal, batch, embeddings)) return;
        ordinal += batch.length;
        await setImmediate();
        if (this.closed) return;
      }
      const published = this.store.finish(job);
      if (published !== undefined && this.backlog.delete(sectionKey(job))) {
        if (published) this.completed++;
        if (this.backlog.size) this.showBacklogProgress();
        else this.finishActivity();
      }
    } catch (error) {
      if (!this.closed) {
        this.setActivity({ stage: 'paused' });
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
  private setActivity(next: AssistantIndexProgress) {
    if (next.stage !== this.activity.stage) this.activitySince = Date.now();
    this.activity = next;
  }

  private showBacklogProgress() {
    this.setActivity({ stage: 'indexing', completed: this.completed, total: this.completed + this.backlog!.size });
  }

  private finishActivity() {
    const { stage } = this.activity;
    if (stage === 'idle' || stage === 'ready') return;
    const flash = stage !== 'updating' || Date.now() - this.activitySince >= 600;
    if (flash) this.readyUntil = Date.now() + 5_000;
    this.setActivity({ stage: flash ? 'ready' : 'idle' });
  }
}

const sectionKey = ({ bufferId, bucket }: Pick<Bucket, 'bufferId' | 'bucket'>) => JSON.stringify([bufferId, bucket]);

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
