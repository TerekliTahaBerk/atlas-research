import type { MessageChangesDto } from '@atlas/core';
import type { LiveStatus } from './realtime';

/*
 * A04.1 cursor reconciliation. Realtime events are hints that may be lost
 * (dispatcher failure, dropped broadcast, missed `topic.rotated`), so the
 * client never relies on them alone:
 *
 *  - a bounded periodic reconcile runs even while the socket reports live
 *    (slower than the degraded poll, paused while the tab is hidden and
 *    resumed immediately when it becomes visible);
 *  - every reconcile drains changes after the applied cursor, so a missed
 *    message appears exactly once (merge is idempotent by ID and cursor);
 *  - every change page names the channel's current private topic; a
 *    mismatch means a rotation notice was lost, and the owner re-fetches its
 *    authorized topic (which resubscribes or reveals revocation);
 *  - a reconcile that finds changes no event announced marks delivery as
 *    `delayed`, a quiet hint that clears when the next event arrives.
 *
 * Only one reconcile is in flight; requests made meanwhile coalesce into a
 * single follow-up pass.
 */
export const LIVE_RECONCILE_MS = 30_000;
export const DEGRADED_RECONCILE_MS = 15_000;

export type DeliveryHealth = 'ok' | 'delayed';
export type ReconcileReason = 'event' | 'resync' | 'poll' | 'command';

export function reconcileDelay(
  status: LiveStatus,
  hidden: boolean,
): number | null {
  if (hidden) return null;
  return status === 'live' ? LIVE_RECONCILE_MS : DEGRADED_RECONCILE_MS;
}

export interface ReconcilerDeps {
  fetchChanges(since: number): Promise<MessageChangesDto>;
  /** Applies one page; must be idempotent (see `mergeMessages`). */
  apply(page: MessageChangesDto): void;
  /** Topic the client is currently subscribed to (null before detail). */
  topic(): string | null;
  /** The subscription topic is stale: re-fetch the channel detail. */
  onTopicStale(current: string): void;
  /** The channel became unreadable (NOT_FOUND) during a reconcile. */
  onDenied(): void;
  onHealth?(health: DeliveryHealth): void;
  onSyncing?(syncing: boolean): void;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

export class Reconciler {
  private cursor = 0;
  private hinted = 0;
  private running: Promise<void> | null = null;
  private followUp: Promise<void> | null = null;
  private timer: unknown = null;
  private status: LiveStatus = 'connecting';
  private hidden = false;
  private stopped = false;
  private health: DeliveryHealth = 'ok';

  constructor(private readonly deps: ReconcilerDeps) {}

  get position() {
    return this.cursor;
  }

  /** Records a cursor already applied by an initial page load. */
  seed(changeSeq: number) {
    this.cursor = Math.max(this.cursor, changeSeq);
    this.hinted = Math.max(this.hinted, changeSeq);
  }

  /** A Realtime event announced a change up to `changeSeq`. */
  hint(changeSeq: number) {
    this.hinted = Math.max(this.hinted, changeSeq);
    this.setHealth('ok');
    if (changeSeq > this.cursor) void this.run('event');
  }

  /** Connection state or tab visibility changed: reschedule the poll. */
  update(status: LiveStatus, hidden: boolean) {
    const resumed = this.hidden && !hidden;
    this.status = status;
    this.hidden = hidden;
    if (resumed) void this.run('resync');
    else this.schedule();
  }

  /**
   * Runs one reconcile. While one is in flight, callers share a single
   * follow-up pass that starts after it, so a caller awaiting `run` always
   * observes changes committed before it called.
   */
  run(reason: ReconcileReason): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.followUp ??= this.running.then(() => {
        this.followUp = null;
        return this.run(reason);
      });
      return this.followUp;
    }
    this.running = this.drain(reason).finally(() => {
      this.running = null;
      if (!this.followUp) this.schedule();
    });
    return this.running;
  }

  stop() {
    this.stopped = true;
    this.clear();
  }

  private async drain(reason: ReconcileReason) {
    this.clear();
    this.deps.onSyncing?.(true);
    const announced = this.hinted;
    const start = this.cursor;
    let staleReported = false;
    try {
      for (;;) {
        const page = await this.deps.fetchChanges(this.cursor);
        if (this.stopped) return;
        this.deps.apply(page);
        this.cursor = Math.max(this.cursor, page.changeSeq);
        const subscribed = this.deps.topic();
        if (
          subscribed !== null &&
          page.topic !== subscribed &&
          !staleReported
        ) {
          staleReported = true;
          this.deps.onTopicStale(page.topic);
        }
        if (!page.more) break;
      }
      // Changes beyond everything any event announced, found while the
      // socket claimed to be live: some delivery was lost or delayed.
      if (
        reason === 'poll' &&
        this.status === 'live' &&
        this.cursor > Math.max(start, announced)
      )
        this.setHealth('delayed');
      this.hinted = Math.max(this.hinted, this.cursor);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'NOT_FOUND'
      )
        this.deps.onDenied();
      // Network and other failures retry on the next scheduled pass.
    } finally {
      this.deps.onSyncing?.(false);
    }
  }

  private setHealth(health: DeliveryHealth) {
    if (this.health === health) return;
    this.health = health;
    this.deps.onHealth?.(health);
  }

  private schedule() {
    this.clear();
    if (this.stopped || this.running) return;
    const delay = reconcileDelay(this.status, this.hidden);
    if (delay === null) return;
    const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.timer = set(() => {
      this.timer = null;
      void this.run('poll');
    }, delay);
  }

  private clear() {
    if (this.timer === null) return;
    const clear =
      this.deps.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    clear(this.timer);
    this.timer = null;
  }
}
