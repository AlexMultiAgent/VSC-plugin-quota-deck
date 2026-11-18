import { describe, expect, it } from 'vitest';
import { activityIconFailure } from './package-contents.mjs';

describe('activity icon packaging', () => {
  it('accepts a packaged Activity Bar SVG', () => {
    expect(activityIconFailure([
      'dist/extension.js',
      'media/activity-bar.svg',
      'package.json',
    ])).toBeUndefined();
  });

  it('rejects a package that omits the Activity Bar SVG', () => {
    expect(activityIconFailure(['dist/extension.js', 'package.json']))
      .toBe('media/activity-bar.svg is not shipped');
  });
});
