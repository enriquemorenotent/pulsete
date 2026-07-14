import type { TranscriptScrollSnapshot } from './viewport-positioning.js';

export const transcriptScrollSnapshotLimit = 128;

export class TranscriptScrollSnapshotStore {
  readonly #snapshots = new Map<string, TranscriptScrollSnapshot>();
  readonly #capacity: number;

  constructor(capacity = transcriptScrollSnapshotLimit) {
    this.#capacity = Math.max(1, Math.floor(capacity));
  }

  get size() {
    return this.#snapshots.size;
  }

  get(bufferId: string) {
    const snapshot = this.#snapshots.get(bufferId);
    if (!snapshot) {
      return null;
    }
    this.#snapshots.delete(bufferId);
    this.#snapshots.set(bufferId, snapshot);
    return snapshot;
  }

  set(bufferId: string, snapshot: TranscriptScrollSnapshot) {
    this.#snapshots.delete(bufferId);
    this.#snapshots.set(bufferId, snapshot);
    while (this.#snapshots.size > this.#capacity) {
      const oldestBufferId = this.#snapshots.keys().next().value;
      if (oldestBufferId === undefined) {
        break;
      }
      this.#snapshots.delete(oldestBufferId);
    }
  }

  delete(bufferId: string) {
    return this.#snapshots.delete(bufferId);
  }

  prune(retainedBufferIds: Iterable<string>) {
    const retained = new Set(retainedBufferIds);
    let removed = 0;
    for (const bufferId of this.#snapshots.keys()) {
      if (!retained.has(bufferId)) {
        this.#snapshots.delete(bufferId);
        removed += 1;
      }
    }
    return removed;
  }
}

export const transcriptScrollSnapshots = new TranscriptScrollSnapshotStore();
