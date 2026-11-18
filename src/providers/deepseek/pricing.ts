import calendarData from './pricing-calendar.json';

export interface Holiday {
  readonly date: string;
  readonly name: string;
}

export interface PeakWindowUtc {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface PricingCalendar {
  readonly version: string;
  readonly coverageStart: string;
  readonly coverageEnd: string;
  readonly peakWindowsUtc: PeakWindowUtc[];
  readonly holidays: Holiday[];
  readonly notes: string;
}

export const calendar = calendarData as PricingCalendar;
export type PricingState = 'peak' | 'offPeak' | 'unavailable';

export function isCovered(isoDate: string): boolean {
  return isoDate >= calendar.coverageStart && isoDate <= calendar.coverageEnd;
}

function shanghaiDate(instant: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function utcMinutes(instant: number): number {
  const date = new Date(instant);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function pricingState(instant: number): PricingState {
  if (!isCovered(shanghaiDate(instant))) return 'unavailable';

  const date = new Date(instant);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return 'offPeak';
  if (calendar.holidays.some((holiday) => holiday.date === shanghaiDate(instant))) {
    return 'offPeak';
  }

  const minutes = utcMinutes(instant);
  const inPeakWindow = calendar.peakWindowsUtc.some(
    (window) => minutes >= window.startMinute && minutes < window.endMinute,
  );
  return inPeakWindow ? 'peak' : 'offPeak';
}
