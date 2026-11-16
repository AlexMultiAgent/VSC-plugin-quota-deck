import { describe, expect, it } from 'vitest';
import { categorizeModel, categorizeModels, pickTightestRemaining, remainingBar } from './parse';
import type { MiniMaxWindow } from './shape';

function window(overrides: Partial<MiniMaxWindow> = {}): MiniMaxWindow {
  return {
    window: 'fiveHour',
    total: 100,
    used: 40,
    remainingPercent: 60,
    remainingPercentSource: 'computed',
    resetAt: 1_800_000_000_000,
    unlimited: false,
    ...overrides,
  };
}

describe('pickTightestRemaining', () => {
  it('picks the window with the lower remaining percentage', () => {
    const picked = pickTightestRemaining([
      window({ window: 'fiveHour', remainingPercent: 60 }),
      window({ window: 'weekly', remainingPercent: 25 }),
    ]);
    expect(picked?.window).toBe('weekly');
  });

  it('excludes an unlimited window from the comparison', () => {
    const picked = pickTightestRemaining([
      window({ window: 'fiveHour', remainingPercent: 60 }),
      window({ window: 'weekly', remainingPercent: 0, unlimited: true }),
    ]);
    expect(picked?.window).toBe('fiveHour');
  });

  it('uses the only available window when the other is missing', () => {
    const picked = pickTightestRemaining([window({ window: 'fiveHour', remainingPercent: 12 })]);
    expect(picked?.remainingPercent).toBe(12);
  });

  it('returns undefined when no window has a percentage', () => {
    const picked = pickTightestRemaining([
      window({ remainingPercent: null, remainingPercentSource: null }),
    ]);
    expect(picked).toBeUndefined();
  });
});

describe('categorizeModel', () => {
  it('maps a text model to the text category', () => {
    expect(categorizeModel('abab6.5s-chat')).toBe('text');
  });

  it('maps a video model to the video category', () => {
    expect(categorizeModel('video-01')).toBe('video');
  });

  it('prefers the hailuo category over video', () => {
    expect(categorizeModel('hailuo-video')).toBe('hailuo');
  });

  it('maps an image model to the image category', () => {
    expect(categorizeModel('image-master')).toBe('image');
  });

  it('maps a speech model to the speech category', () => {
    expect(categorizeModel('speech-02')).toBe('speech');
  });

  it('falls back to other for an unknown model', () => {
    expect(categorizeModel('something-else')).toBe('other');
  });

  it('adds categories to all model rows', () => {
    expect(categorizeModels([
      { model: 'general', remaining: 10, total: 20 },
      { model: 'video', remaining: 3, total: 3 },
    ]).map((model) => model.category)).toEqual(['text', 'video']);
  });
});

describe('remainingBar', () => {
  it('fills one cell per ten percent', () => {
    expect(remainingBar(60)).toBe('██████░░░░');
  });

  it('rounds to the nearest cell', () => {
    expect(remainingBar(65)).toBe('███████░░░');
  });

  it('keeps at least one filled cell above zero', () => {
    expect(remainingBar(3)).toBe('█░░░░░░░░░');
  });

  it('renders an empty bar at zero', () => {
    expect(remainingBar(0)).toBe('░░░░░░░░░░');
  });

  it('clamps a value above one hundred', () => {
    expect(remainingBar(140)).toBe('██████████');
  });
});
