import type { ResolvedLanguage, Translator } from '../../localization';

export interface DashboardLocalization {
  readonly language: ResolvedLanguage;
  readonly title: string;
  readonly loading: string;
  readonly reloading: string;
  readonly loadFailed: string;
  readonly retry: string;
}

export function dashboardLocalization(
  language: ResolvedLanguage,
  t: Translator,
): DashboardLocalization {
  return {
    language,
    title: t('dashboard.title'),
    loading: t('dashboard.webview.loading'),
    reloading: t('dashboard.webview.reloading'),
    loadFailed: t('dashboard.webview.loadFailed'),
    retry: t('dashboard.webview.retry'),
  };
}
