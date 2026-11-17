export type QuotaTone = 'positive' | 'warning' | 'critical';

const CRITICAL_THRESHOLD_PERCENT = 10;

export function quotaTone(percent: number, warningThresholdPercent: number): QuotaTone {
  if (percent <= CRITICAL_THRESHOLD_PERCENT) return 'critical';
  if (percent < warningThresholdPercent) return 'warning';
  return 'positive';
}
