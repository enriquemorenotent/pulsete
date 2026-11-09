export type AutosaveState = 'pending' | 'saving' | 'saved' | 'error';
export type AutosaveSnapshot = { value: string; state: AutosaveState };
type Save = (key: string, value: string) => Promise<boolean>;
type Scheduler = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};
type Job = { value: string; save: Save };
type Entry = {
  pending?: Job;
  saving: boolean;
  ready: boolean;
  snapshot: AutosaveSnapshot;
  timer?: unknown;
};
type Options = {
  delayMs?: number | ((value: string) => number);
  retryDelayMs?: number | null;
  scheduler?: Scheduler;
};

/** Serializes writes per key and coalesces pending edits to the newest value. */
export class AutosaveQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Map<string, Set<(snapshot: AutosaveSnapshot) => void>>();
  private active = true;
  private readonly scheduler: Scheduler;

  constructor(private saveValue: Save | null, private readonly options: Options = {}) {
    this.scheduler = options.scheduler ?? {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
    };
  }

  setSave(save: Save) { this.saveValue = save; }
  resume() { this.active = true; }
  getSnapshot(key: string) { return this.entries.get(key)?.snapshot; }

  subscribe(key: string, listener: (snapshot: AutosaveSnapshot) => void) {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  }

  enqueue(key: string, value: string, save?: Save) {
    if (!this.active) return;
    const entry = this.entries.get(key) ?? {
      saving: false, ready: false, snapshot: { value, state: 'pending' as const },
    };
    this.entries.set(key, entry);
    if (!save && !this.saveValue) throw new Error('Autosave requires a save callback');
    // Capture an explicit writer so changing editors cannot redirect an old save.
    entry.pending = { value, save: save ?? ((id, text) => this.saveValue!(id, text)) };
    this.publish(key, entry, { value, state: 'pending' });
    const delay = this.options.delayMs ?? 250;
    this.schedule(key, entry, typeof delay === 'function' ? delay(value) : delay);
  }

  flush(key?: string) {
    for (const [id, entry] of this.entries) {
      if (key !== undefined && id !== key) continue;
      this.cancelTimer(entry);
      entry.ready = true;
      void this.save(id, entry);
    }
  }

  // Drain queued edits in order, but do not keep retrying after teardown.
  stop() {
    this.active = false;
    this.flush();
  }

  private publish(key: string, entry: Entry, snapshot: AutosaveSnapshot) {
    entry.snapshot = snapshot;
    for (const listener of this.listeners.get(key) ?? []) listener(snapshot);
  }

  private cancelTimer(entry: Entry) {
    if (entry.timer !== undefined) this.scheduler.clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  private schedule(key: string, entry: Entry, delayMs: number) {
    this.cancelTimer(entry);
    entry.ready = delayMs === 0;
    if (entry.ready) void this.save(key, entry);
    else entry.timer = this.scheduler.setTimeout(() => {
      entry.timer = undefined;
      entry.ready = true;
      void this.save(key, entry);
    }, delayMs);
  }

  private async save(key: string, entry: Entry): Promise<void> {
    if (entry.saving || !entry.ready || !entry.pending) return;
    const job = entry.pending;
    entry.pending = undefined;
    entry.saving = true;
    this.publish(key, entry, { value: job.value, state: 'saving' });
    let saved = false;
    try { saved = await job.save(key, job.value); } catch { /* Treat rejections as failed saves. */ }
    entry.saving = false;
    if (entry.pending) {
      // Only the newest edit may report completion or be retried.
      void this.save(key, entry);
    } else if (!saved && this.active) {
      entry.pending = job;
      entry.ready = false;
      this.publish(key, entry, { value: job.value, state: 'error' });
      const retryDelay = this.options.retryDelayMs === undefined ? 2_000 : this.options.retryDelayMs;
      if (retryDelay !== null) this.schedule(key, entry, retryDelay);
    } else {
      this.entries.delete(key);
      this.publish(key, entry, { value: job.value, state: saved ? 'saved' : 'error' });
    }
  }
}
