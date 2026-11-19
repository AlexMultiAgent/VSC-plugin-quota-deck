import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../localization';
import { dashboardLocalization } from './locale';

describe('dashboardLocalization', () => {
  it('builds the English webview bootstrap strings', () => {
    expect(dashboardLocalization('en-US', translatorFor('en-US'))).toEqual({
      language: 'en-US',
      title: 'QuotaDeck CN — Usage & Insights',
      loading: 'Loading quota data…',
      reloading: 'Reloading quota data…',
      loadFailed: 'Quota data is temporarily unavailable.',
      retry: 'Reload',
    });
  });
});
