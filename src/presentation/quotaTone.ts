export type QuotaTone = 'positive' | 'warning' | 'critical';

const CRITICAL_THRESHOLD_PERCENT = 5;

/**
 * Three stages only: green at or above the configured threshold, orange below it,
 * red at or under 5%. The former hard-coded 50% yellow "caution" stage is gone —
 * it was neither configurable nor mentioned by the setting, so a 45% window read
 * as a warning the user could not tune away.
 */
export function quotaTone(percent: number, warningThresholdPercent: number): QuotaTone {
  if (percent <= CRITICAL_THRESHOLD_PERCENT) return 'critical';
  if (percent < warningThresholdPercent) return 'warning';
  return 'positive';
}
