/** One request lane: only its newest request may update the caller's state. */
export class LatestRequest {
  private current: AbortController | null = null;

  get pending() {
    return this.current !== null;
  }

  cancel() {
    const previous = this.current;
    this.current = null;
    previous?.abort();
  }

  async run<T>({ load, onLoaded, onError, onSettled }: {
    load: (signal: AbortSignal) => Promise<T>;
    onLoaded: (value: T) => void;
    onError: (error: unknown) => void;
    onSettled?: () => void;
  }): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.current = controller;
    const isCurrent = () => this.current === controller && !controller.signal.aborted;
    try {
      const value = await load(controller.signal);
      if (isCurrent()) onLoaded(value);
    } catch (error) {
      if (isCurrent()) onError(error);
    } finally {
      if (isCurrent()) {
        this.current = null;
        onSettled?.();
      }
    }
  }
}
