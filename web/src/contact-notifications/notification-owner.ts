export const systemNotificationLifetimeMs = 30_000;
export const systemNotificationOwnerCapacity = 20;

type TimerScheduler = {
  clearTimeout: (timer: unknown) => void;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
};

type NotificationOwnerOptions<Notification> = {
  capacity?: number;
  close: (notification: Notification) => void;
  lifetimeMs?: number;
  scheduler?: TimerScheduler;
};

type OwnedNotification<Notification> = {
  notification: Notification;
  timer: unknown;
};

const defaultScheduler: TimerScheduler = {
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

export class NotificationOwner<Key, Notification> {
  readonly #capacity: number;
  readonly #close: (notification: Notification) => void;
  readonly #entries = new Map<Key, OwnedNotification<Notification>>();
  readonly #lifetimeMs: number;
  readonly #scheduler: TimerScheduler;

  constructor(options: NotificationOwnerOptions<Notification>) {
    this.#capacity = options.capacity ?? systemNotificationOwnerCapacity;
    this.#lifetimeMs = options.lifetimeMs ?? systemNotificationLifetimeMs;
    if (!Number.isInteger(this.#capacity) || this.#capacity < 1) {
      throw new RangeError('Notification owner capacity must be a positive integer.');
    }
    if (!Number.isFinite(this.#lifetimeMs) || this.#lifetimeMs <= 0) {
      throw new RangeError('Notification lifetime must be a positive number.');
    }
    this.#close = options.close;
    this.#scheduler = options.scheduler ?? defaultScheduler;
  }

  get size() {
    return this.#entries.size;
  }

  get(key: Key) {
    return this.#entries.get(key)?.notification;
  }

  track(key: Key, notification: Notification) {
    const previous = this.#entries.get(key);
    if (previous) {
      this.#detach(key, previous);
      if (previous.notification !== notification) {
        this.#closeSafely(previous.notification);
      }
    }
    const entry: OwnedNotification<Notification> = {
      notification,
      timer: this.#scheduler.setTimeout(
        () => this.close(key, notification),
        this.#lifetimeMs,
      ),
    };
    this.#entries.set(key, entry);
    this.#enforceCapacity();
    return notification;
  }

  release(key: Key, notification?: Notification) {
    const entry = this.#entries.get(key);
    if (!entry || (notification !== undefined && entry.notification !== notification)) {
      return false;
    }
    this.#detach(key, entry);
    return true;
  }

  close(key: Key, notification?: Notification) {
    const entry = this.#entries.get(key);
    if (!entry || (notification !== undefined && entry.notification !== notification)) {
      return false;
    }
    this.#detach(key, entry);
    this.#closeSafely(entry.notification);
    return true;
  }

  closeAll() {
    for (const [key, entry] of [...this.#entries]) {
      this.#detach(key, entry);
      this.#closeSafely(entry.notification);
    }
  }

  #detach(key: Key, entry: OwnedNotification<Notification>) {
    this.#entries.delete(key);
    this.#scheduler.clearTimeout(entry.timer);
  }

  #closeSafely(notification: Notification) {
    try {
      this.#close(notification);
    } catch {
      // Ownership is already released; closing failures must not retain the handle.
    }
  }

  #enforceCapacity() {
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.entries().next().value as
        | [Key, OwnedNotification<Notification>]
        | undefined;
      if (!oldest) {
        return;
      }
      this.close(oldest[0], oldest[1].notification);
    }
  }
}
