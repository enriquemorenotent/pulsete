type CacheOptions<Value> = {
  limit: number;
  ttlMs: (value: Value) => number;
  now?: () => number;
};

/** Share in-flight work independently of the bounded cache of completed results. */
export class AsyncResultCache<Key, Value> {
  private readonly pending = new Map<Key, Promise<Value>>();
  private readonly completed = new Map<Key, { expiresAt: number; promise: Promise<Value> }>();
  private readonly now: () => number;

  constructor(private readonly options: CacheOptions<Value>) {
    if (!Number.isInteger(options.limit) || options.limit < 0) {
      throw new RangeError('Cache limit must be a non-negative integer');
    }
    this.now = options.now ?? Date.now;
  }

  get(key: Key, load: () => Promise<Value>): Promise<Value> {
    const running = this.pending.get(key);
    if (running) return running;
    const cached = this.completed.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.promise;
    this.completed.delete(key);

    // Defer the loader so even synchronous failures use the same cleanup path.
    const promise = Promise.resolve().then(load).then(value => {
      const ttl = this.options.ttlMs(value);
      if (ttl > 0 && this.options.limit > 0) {
        this.completed.set(key, { expiresAt: this.now() + ttl, promise });
        while (this.completed.size > this.options.limit) {
          const oldest = this.completed.keys().next();
          if (oldest.done) break;
          this.completed.delete(oldest.value);
        }
      }
      return value;
    }).finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }
}
