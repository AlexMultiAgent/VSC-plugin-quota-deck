export const SHANGHAI = 'Asia/Shanghai';

export const RANGE_IDS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as const;
export type RangeId = (typeof RANGE_IDS)[number];
export type Bucket = 'hour' | 'day';

export interface DateRange {
  readonly id: RangeId;
  readonly start: number;
  readonly end: number;
  readonly bucket: Bucket;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function toShanghaiDayStart(instant: number): number {
  const shanghai = new Date(instant + 8 * HOUR);
  const midnightUtc = Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate(),
  );
  return midnightUtc - 8 * HOUR;
}

function startOfShanghaiMonth(instant: number, monthOffset: number): number {
  const shanghai = new Date(instant + 8 * HOUR);
  const year = shanghai.getUTCFullYear();
  const month = shanghai.getUTCMonth() + monthOffset;
  return Date.UTC(year, month, 1) - 8 * HOUR;
}

export function rangeFor(id: RangeId, now: number): DateRange {
  const dayStart = toShanghaiDayStart(now);
  switch (id) {
    case 'today':
      return { id, start: dayStart, end: now, bucket: 'hour' };
    case 'yesterday':
      return { id, start: dayStart - DAY, end: dayStart, bucket: 'day' };
    case 'last7':
      return { id, start: dayStart - 6 * DAY, end: now, bucket: 'day' };
    case 'last30':
      return { id, start: dayStart - 29 * DAY, end: now, bucket: 'day' };
    case 'thisMonth':
      return { id, start: startOfShanghaiMonth(now, 0), end: now, bucket: 'day' };
    case 'lastMonth':
      return {
        id,
        start: startOfShanghaiMonth(now, -1),
        end: startOfShanghaiMonth(now, 0),
        bucket: 'day',
      };
  }
}

export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 60_000));
  const minutes = total % 60;
  const hours = Math.floor(total / 60);
  if (hours < 1) return `${minutes}m`;
  if (hours < 24) {
    const remainingHours = hours % 24;
    const days = Math.floor(hours / 24);
    return days === 0 ? `${remainingHours}h${minutes}m` : `${days}d${remainingHours}h`;
  }
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}
