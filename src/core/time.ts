export const SHANGHAI = 'Asia/Shanghai';

/** Setting value that follows the operating system time zone. */
export const AUTO_TIME_ZONE = 'auto';

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

function isKnownZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The operating system's IANA zone, or Shanghai when the runtime reports none. */
export function systemTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isKnownZone(zone) ? zone : SHANGHAI;
  } catch {
    return SHANGHAI;
  }
}

/**
 * Guards a user-supplied IANA time zone. `Intl.DateTimeFormat` throws a
 * `RangeError` for an unknown zone, so an unvalidated setting would crash the
 * extension on the next refresh. An unusable value follows the operating system
 * rather than a hard-coded city.
 */
export function validTimeZone(zone: unknown): string {
  return isKnownZone(zone) ? zone : systemTimeZone();
}

/** `auto` follows the operating system; an unrecognized zone falls back the same way. */
export function resolveTimeZone(zone: unknown): string {
  if (typeof zone === 'string' && zone.trim().toLowerCase() === AUTO_TIME_ZONE) {
    return systemTimeZone();
  }
  return validTimeZone(zone);
}

/** The zone's `UTC±HH:MM` offset and `HH:MM` wall clock at one instant, for pickers. */
export function zoneSummary(
  instant: number,
  timeZone: string,
): { readonly offset: string; readonly clock: string } {
  const { hour, minute } = zonedParts(instant, timeZone);
  const totalMinutes = Math.round(offsetAt(instant, timeZone) / 60_000);
  const sign = totalMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(totalMinutes);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return {
    offset: `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`,
    clock: `${pad(hour)}:${pad(minute)}`,
  };
}
