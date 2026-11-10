export type OutgoingActionState = 'waiting' | 'confirmed' | 'failed' | 'cancelled' | 'unknown';

/** One owner for pending IRC work. Silence and disconnects never prove success. */
export class OutgoingActions {
  private readonly pending = new Set<OutgoingAction>();

  start(deadline: number, onDeadline?: () => void): OutgoingAction {
    const action = new OutgoingAction(deadline, () => this.pending.delete(action), onDeadline);
    this.pending.add(action);
    return action;
  }

  expire(now = Date.now()) {
    for (const action of [...this.pending]) action.expire(now);
  }

  disconnect() {
    for (const action of [...this.pending]) action.finish('unknown');
  }
}

export class OutgoingAction {
  state: OutgoingActionState = 'waiting';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    public deadline: number,
    private readonly release: () => void,
    private readonly onDeadline?: () => void,
  ) { this.schedule(); }

  refresh(deadline: number) {
    if (this.state !== 'waiting') return;
    this.deadline = deadline;
    this.schedule();
  }

  finish(state: Exclude<OutgoingActionState, 'waiting'>) {
    // A definite late reply may resolve an unknown outcome.
    if (this.state !== 'waiting' && !(this.state === 'unknown' && (state === 'confirmed' || state === 'failed'))) return;
    this.state = state;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.release();
  }

  expire(now = Date.now()) {
    if (this.state !== 'waiting' || now < this.deadline) return;
    this.finish('unknown');
    this.onDeadline?.();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!Number.isFinite(this.deadline)) return;
    this.timer = setTimeout(() => {
      this.expire();
      // Timers can wake just before their wall-clock deadline.
      if (this.state === 'waiting') this.schedule();
    }, Math.max(1, this.deadline - Date.now()));
    this.timer.unref?.();
  }
}
