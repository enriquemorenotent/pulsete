type SaveDraft = (bufferId: string, body: string) => Promise<boolean>;
type Scheduler = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};
type Entry = {
  pending: string | undefined;
  saving: boolean;
  ready: boolean;
  timer?: unknown;
};

/** Keeps one save in flight per conversation, coalescing edits to the latest text. */
export class DraftSaveQueue {
  private readonly entries = new Map<string, Entry>();
  private active = true;

  constructor(
    private saveDraft: SaveDraft,
    private readonly scheduler: Scheduler = {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
    },
  ) {}

  setSaveDraft(saveDraft: SaveDraft) {
    this.saveDraft = saveDraft;
  }

  resume() {
    this.active = true;
  }

  enqueue(bufferId: string, body: string) {
    if (!this.active) return;
    const entry = this.entries.get(bufferId) ?? { pending: undefined, saving: false, ready: false };
    this.entries.set(bufferId, entry);
    entry.pending = body;
    this.schedule(bufferId, entry, body ? 250 : 0);
  }

  flush() {
    for (const [bufferId, entry] of this.entries) {
      this.cancelTimer(entry);
      entry.ready = true;
      void this.save(bufferId, entry);
    }
  }

  // Drain queued edits in order, but do not keep retrying after teardown.
  stop() {
    this.active = false;
    this.flush();
  }

  private cancelTimer(entry: Entry) {
    if (entry.timer !== undefined) this.scheduler.clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  private schedule(bufferId: string, entry: Entry, delayMs: number) {
    this.cancelTimer(entry);
    entry.ready = delayMs === 0;
    if (entry.ready) {
      void this.save(bufferId, entry);
    } else {
      entry.timer = this.scheduler.setTimeout(() => {
        entry.timer = undefined;
        entry.ready = true;
        void this.save(bufferId, entry);
      }, delayMs);
    }
  }

  private async save(bufferId: string, entry: Entry): Promise<void> {
    if (entry.saving || !entry.ready || entry.pending === undefined) return;
    const body = entry.pending;
    entry.pending = undefined;
    entry.saving = true;
    let saved = false;
    try {
      saved = await this.saveDraft(bufferId, body);
    } catch {
      // A rejected request follows the same retry rules as a reported failure.
    }
    entry.saving = false;
    if (!saved && entry.pending === undefined && this.active) {
      entry.pending = body;
      this.schedule(bufferId, entry, 2_000);
    } else if (entry.pending !== undefined) {
      // A newer edit always wins, even if the previous save failed.
      void this.save(bufferId, entry);
    } else {
      this.entries.delete(bufferId);
    }
  }
}
