const retryDelayMs = 5_000;
const pendingCleanups = new Set<() => Promise<void>>();

// Share concurrent attempts, but cache only successful cleanup permanently.
// Failed attempts stay registered even when connection setup never returned a lease.
export const createNordVpnCleanup = (cleanup: () => Promise<void>) => {
  let attempt: Promise<void> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const release = (): Promise<void> => {
    if (attempt) return attempt;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    pendingCleanups.add(release);
    attempt = Promise.resolve().then(cleanup).then(() => {
      pendingCleanups.delete(release);
    }, error => {
      attempt = undefined;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void release().catch(() => { /* The next retry is already scheduled. */ });
      }, retryDelayMs);
      retryTimer.unref();
      throw error;
    });
    return attempt;
  };
  return release;
};

export const retryNordVpnCleanups = async () => {
  await Promise.allSettled([...pendingCleanups].map(release => release()));
};
