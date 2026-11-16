export interface SchedulerOptions {
  readonly refreshIntervalMinutes: number;
  readonly pauseWhenUnfocused: boolean;
  readonly manualDebounceMs?: number;
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private focused = true;
  private lastRefreshAt = 0;
  private refresh: (() => Promise<void>) | undefined;
  private backoffUntil = 0;
  private lastManualAt = Number.NEGATIVE_INFINITY;
  private manualInFlight: Promise<void> | undefined;

  constructor(private readonly options: SchedulerOptions) {}

  start(refresh: () => Promise<void>): void {
    this.refresh = refresh;
    this.stop();
    this.lastRefreshAt = Date.now();
    this.timer = setInterval(() => {
      if (this.options.pauseWhenUnfocused && !this.focused) return;
      if (Date.now() < this.backoffUntil) return;
      void this.run();
    }, this.options.refreshIntervalMinutes * 60_000);
  }

  async refreshNow(): Promise<void> {
    if (this.manualInFlight !== undefined) return this.manualInFlight;
    const debounce = this.options.manualDebounceMs ?? 2_000;
    if (Date.now() - this.lastManualAt < debounce) return;
    this.lastManualAt = Date.now();
    this.manualInFlight = this.run().finally(() => {
      this.manualInFlight = undefined;
    });
    return this.manualInFlight;
  }

  pauseUntil(timestamp: number): void {
    this.backoffUntil = Math.max(this.backoffUntil, timestamp);
  }

  setFocused(focused: boolean): void {
    const wasFocused = this.focused;
    this.focused = focused;
    if (focused && !wasFocused) void this.runIfStale();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async run(): Promise<void> {
    this.lastRefreshAt = Date.now();
    if (this.refresh === undefined) return;
    await this.refresh();
  }

  private async runIfStale(): Promise<void> {
    if (this.refresh === undefined) return;
    if (Date.now() < this.backoffUntil) return;
    const age = Date.now() - this.lastRefreshAt;
    if (age >= this.options.refreshIntervalMinutes * 60_000) await this.run();
  }
}
