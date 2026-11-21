import type { Translator } from '../localization';
import { AUTO_TIME_ZONE, systemTimeZone, zoneSummary } from '../core/time';

export interface TimeZoneItem {
  readonly label: string;
  readonly description: string;
  readonly detail: string;
  /** Value written to `quotaDeck.timeZone`; `auto` follows the operating system. */
  readonly zone: string;
  readonly picked: boolean;
}

/** Used only when the runtime has no `Intl.supportedValuesOf`. */
const FALLBACK_ZONES = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'UTC',
];

/**
 * Every IANA zone the runtime knows. The settings manifest cannot enumerate them
 * (there are hundreds, and ICU adds and renames them), which is why the choice
 * lives in a Quick Pick instead of a settings dropdown.
 */
export function knownTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?(key: string): string[] };
  let zones: string[] | undefined;
  try {
    zones = intl.supportedValuesOf?.('timeZone');
  } catch {
    zones = undefined;
  }
  const usable = zones?.filter((zone) => typeof zone === 'string' && zone.trim() !== '');
  return usable === undefined || usable.length === 0
    ? [...FALLBACK_ZONES]
    : [...new Set(usable)].sort((left, right) => left.localeCompare(right));
}

function zoneItem(
  zone: string,
  system: string,
  current: string,
  t: Translator,
  now: number,
): TimeZoneItem {
  const { offset, clock } = zoneSummary(now, zone);
  const marks = [
    zone === system ? t('timeZone.system') : undefined,
    zone === current ? t('timeZone.current') : undefined,
  ].filter((mark): mark is string => mark !== undefined);
  return {
    label: zone,
    description: `${offset} · ${clock}`,
    detail: marks.join(' · '),
    zone,
    picked: zone === current,
  };
}

/** `auto` first, then the system zone, then every other zone alphabetically. */
export function buildTimeZoneItems(
  current: string,
  t: Translator,
  now: number = Date.now(),
): TimeZoneItem[] {
  const system = systemTimeZone();
  const selected = current.trim().toLowerCase() === AUTO_TIME_ZONE ? AUTO_TIME_ZONE : current;
  const { offset, clock } = zoneSummary(now, system);
  const auto: TimeZoneItem = {
    label: t('timeZone.auto'),
    description: `${system} · ${offset} · ${clock}`,
    detail: selected === AUTO_TIME_ZONE ? t('timeZone.current') : '',
    zone: AUTO_TIME_ZONE,
    picked: selected === AUTO_TIME_ZONE,
  };
  const others = knownTimeZones().filter((zone) => zone !== system);
  return [
    auto,
    zoneItem(system, system, selected, t, now),
    ...others.map((zone) => zoneItem(zone, system, selected, t, now)),
  ];
}
