import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Warn well before the release gate's hard 30-day stop. */
export const WARNING_DAYS = 60;

export function calendarDaysLeft(calendar, now = Date.now()) {
  const end = Date.parse(calendar.coverageEnd);
  if (Number.isNaN(end)) return Number.NEGATIVE_INFINITY;
  return Math.floor((end - now) / 86_400_000);
}

export function calendarExpiryFailure(calendar, now = Date.now(), warningDays = WARNING_DAYS) {
  const days = calendarDaysLeft(calendar, now);
  return days < warningDays
    ? `pricing calendar ${calendar.version} covers only ${days} more days (warning at ${warningDays})`
    : undefined;
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const calendar = JSON.parse(
    readFileSync(resolve(root, 'src', 'providers', 'deepseek', 'pricing-calendar.json'), 'utf8'),
  );
  const failure = calendarExpiryFailure(calendar);
  if (failure !== undefined) {
    console.error(failure);
    process.exit(1);
  }
  console.log(`Pricing calendar OK: ${calendar.version} covers ${calendarDaysLeft(calendar)} more days.`);
}

if (process.argv[1]?.endsWith('check-calendar.mjs')) main();
