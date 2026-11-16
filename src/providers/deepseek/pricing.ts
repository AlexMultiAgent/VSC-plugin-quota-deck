import calendarData from './pricing-calendar.json';

export interface Holiday {
  readonly date: string;
  readonly name: string;
}

export interface PricingCalendar {
  readonly version: string;
  readonly coverageStart: string;
  readonly coverageEnd: string;
  readonly offPeakStartMinute: number;
  readonly offPeakEndMinute: number;
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

function shanghaiMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export function pricingState(instant: number): PricingState {
  if (!isCovered(shanghaiDate(instant))) return 'unavailable';
  const minutes = shanghaiMinutes(instant);
  const offPeak =
    minutes >= calendar.offPeakStartMinute && minutes < calendar.offPeakEndMinute;
  return offPeak ? 'offPeak' : 'peak';
}
