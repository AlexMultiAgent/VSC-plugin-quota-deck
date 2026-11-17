import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler';

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes on the configured interval', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not refresh while the window is unfocused', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);
    scheduler.setFocused(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('refreshes immediately when the window regains focus and the data is stale', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);
    scheduler.setFocused(false);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    scheduler.setFocused(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does not refresh on focus when the data is still fresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);
    scheduler.setFocused(false);
    scheduler.setFocused(true);
    expect(refresh).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('stops the timer', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('debounces a burst of manual refreshes into one request', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);
    await scheduler.refreshNow();
    await scheduler.refreshNow();
    await scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('pauses automatic refresh until the backoff expires', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);
    scheduler.pauseUntil(Date.now() + 10 * 60_000);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('uses the new interval after a reconfiguration', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);
    scheduler.reconfigure({ refreshIntervalMinutes: 1, pauseWhenUnfocused: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
