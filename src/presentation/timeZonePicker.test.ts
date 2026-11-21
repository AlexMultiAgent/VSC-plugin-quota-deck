import { describe, expect, it } from 'vitest';
import { systemTimeZone } from '../core/time';
import { translatorFor } from '../localization';
import { buildTimeZoneItems, knownTimeZones } from './timeZonePicker';

const zh = translatorFor('zh-CN');
const en = translatorFor('en-US');
const now = Date.parse('2026-11-21T12:00:00Z');

describe('knownTimeZones', () => {
  it('lists the IANA zones the runtime knows, sorted and unique', () => {
    const zones = knownTimeZones();
    expect(zones.length).toBeGreaterThan(10);
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones).toContain(systemTimeZone());
    expect([...zones].sort((left, right) => left.localeCompare(right))).toEqual(zones);
  });
});

describe('buildTimeZoneItems', () => {
  it('offers auto first and marks the system zone beneath it', () => {
    const items = buildTimeZoneItems('auto', zh, now);
    expect(items[0]?.zone).toBe('auto');
    expect(items[0]?.label).toBe(zh('timeZone.auto'));
    expect(items[0]?.picked).toBe(true);
    expect(items[0]?.detail).toBe(zh('timeZone.current'));
    expect(items[0]?.description).toContain(systemTimeZone());
    expect(items[1]?.zone).toBe(systemTimeZone());
    expect(items[1]?.detail).toContain(zh('timeZone.system'));
  });

  it('marks a concrete current setting instead of auto', () => {
    const items = buildTimeZoneItems('America/New_York', en, now);
    expect(items[0]?.picked).toBe(false);
    const current = items.find((item) => item.zone === 'America/New_York');
    expect(current?.picked).toBe(true);
    expect(current?.detail).toContain(en('timeZone.current'));
  });

  it('describes every zone with its UTC offset and local time', () => {
    const items = buildTimeZoneItems('auto', en, now);
    expect(items.find((item) => item.zone === 'Asia/Shanghai')?.description).toBe(
      'UTC+08:00 · 20:00',
    );
    expect(items.find((item) => item.zone === 'America/New_York')?.description).toBe(
      'UTC-05:00 · 07:00',
    );
  });

  it('lists the system zone exactly once', () => {
    const items = buildTimeZoneItems('auto', en, now);
    const zones = items.map((item) => item.zone);
    expect(zones.filter((zone) => zone === systemTimeZone())).toHaveLength(1);
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones.length).toBe(new Set([...knownTimeZones(), 'auto']).size);
  });
});
