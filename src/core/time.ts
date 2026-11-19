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

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = offsetFormatters.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  offsetFormatters.set(timeZone, formatter);
  return formatter;
}

/** The wall-clock fields of an instant in the given time zone. */
export function zonedParts(instant: number, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(instant));
  const read = (type: string): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Midnight of the calendar day that contains the instant, in the given time zone. */
export function toDayStart(instant: number, timeZone: string): number {
  const { year, month, day } = zonedParts(instant, timeZone);
  const localMidnight = Date.UTC(year, month - 1, day);
  return localMidnight - offsetAt(localMidnight, timeZone);
}

/** The UTC offset of the time zone at the given instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function toShanghaiDayStart(instant: number): number {
  return toDayStart(instant, SHANGHAI);
}

function startOfMonth(instant: number, monthOffset: number, timeZone: string): number {
  const { year, month } = zonedParts(instant, timeZone);
  const localFirst = Date.UTC(year, month - 1 + monthOffset, 1);
  return localFirst - offsetAt(localFirst, timeZone);
}

export function rangeFor(id: RangeId, now: number, timeZone: string = SHANGHAI): DateRange {
  const dayStart = toDayStart(now, timeZone);
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
      return { id, start: startOfMonth(now, 0, timeZone), end: now, bucket: 'day' };
    case 'lastMonth':
      return {
        id,
        start: startOfMonth(now, -1, timeZone),
        end: startOfMonth(now, 0, timeZone),
        bucket: 'day',
      };
  }
}

/**
 * Guards a user-supplied IANA time zone. `Intl.DateTimeFormat` throws a
 * `RangeError` for an unknown zone, so an unvalidated setting would crash the
 * extension on the next refresh.
 */
export function validTimeZone(zone: unknown): string {
  if (typeof zone !== 'string' || zone.trim() === '') return SHANGHAI;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return SHANGHAI;
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
