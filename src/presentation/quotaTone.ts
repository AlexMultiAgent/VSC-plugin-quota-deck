export type QuotaTone = 'positive' | 'caution' | 'warning' | 'critical';

const CRITICAL_THRESHOLD_PERCENT = 5;
const CAUTION_THRESHOLD_PERCENT = 50;

export function quotaTone(percent: number, warningThresholdPercent: number): QuotaTone {
  if (percent <= CRITICAL_THRESHOLD_PERCENT) return 'critical';
  if (percent < warningThresholdPercent) return 'warning';
  if (percent < CAUTION_THRESHOLD_PERCENT) return 'caution';
  return 'positive';
}
