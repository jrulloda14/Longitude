import { describe, expect, it, vi } from 'vitest';
import {
  MAX_INSTANT, MIN_INSTANT, MS, addLocalDays, assertInstant, dayNumber, dayShift,
  formatDateTimeShort, formatDiff, formatLongDate, formatOffset, formatShortDate,
  formatTime, formatTimeString, isValidZone, minuteOfDay, nextTransition, normalizeZone,
  offsetMinutes, offsetSeconds, relativeDay, relativeSpan, resolveWall, startOfLocalDay,
  systemZone, wallTime, zoneAbbreviation,
} from './time';
import { Temporal } from '@js-temporal/polyfill';

const utc = (iso: string) => Date.parse(iso); // only explicit absolute ISO fixtures, never local parsing
const format = { hour12: true };

describe('independent conversion fixtures', () => {
  it.each([
    ['Asia/Manila', '2026-10-20T13:00Z', 2026, 10, 20, 21, 0, 480],
    ['America/New_York', '2026-10-20T13:00Z', 2026, 10, 20, 9, 0, -240],
    ['Europe/London', '2026-10-20T13:00Z', 2026, 10, 20, 14, 0, 60],
    ['Australia/Sydney', '2026-10-20T13:00Z', 2026, 10, 21, 0, 0, 660],
    ['Asia/Kathmandu', '2026-10-20T00:00Z', 2026, 10, 20, 5, 45, 345],
    ['Australia/Adelaide', '2026-06-01T00:00Z', 2026, 6, 1, 9, 30, 570],
    ['Australia/Adelaide', '2026-12-01T00:00Z', 2026, 12, 1, 10, 30, 630],
    ['Pacific/Chatham', '2026-06-01T00:00Z', 2026, 6, 1, 12, 45, 765],
    ['Pacific/Chatham', '2026-12-01T00:00Z', 2026, 12, 1, 13, 45, 825],
    ['Pacific/Kiritimati', '2026-10-20T13:00Z', 2026, 10, 21, 3, 0, 840],
    ['Pacific/Honolulu', '2026-10-20T13:00Z', 2026, 10, 20, 3, 0, -600],
    ['UTC', '2028-02-29T23:59Z', 2028, 2, 29, 23, 59, 0],
  ] as const)('%s at %s', (zone, iso, year, month, day, hour, minute, offset) => {
    expect(wallTime(zone, utc(iso))).toMatchObject({ year, month, day, hour, minute });
    expect(offsetMinutes(zone, utc(iso))).toBe(offset);
    expect(resolveWall(zone, year, month, day, hour, minute).instant).toBe(utc(iso));
  });

  it('retains historical second offsets instead of rounding or assuming 1900 for year 99', () => {
    const at = utc('1900-01-01T00:00:00Z');
    expect(offsetSeconds('Europe/Paris', at)).toBe(561);
    expect(offsetMinutes('Europe/Paris', at)).toBe(9.35);
    expect(formatOffset(offsetMinutes('Europe/Paris', at))).toBe('UTC+0:09:21');
    const ancient = resolveWall('UTC', 99, 1, 1, 0, 0).instant;
    expect(new Date(ancient).toISOString()).toBe('0099-01-01T00:00:00.000Z');
    expect(offsetSeconds('UTC', ancient)).toBe(0);
    expect(dayNumber('UTC', ancient)).toBe(Math.floor(ancient / MS.DAY));
  });

  it('supports date-line differences of two calendar dates', () => {
    expect(dayShift('Pacific/Kiritimati', 'Pacific/Honolulu', utc('2026-10-20T10:30Z'))).toBe(1);
    expect(dayShift('Pacific/Kiritimati', 'Etc/GMT+12', utc('2026-10-20T10:30Z'))).toBe(2);
    expect(dayShift('Etc/GMT+12', 'Pacific/Kiritimati', utc('2026-10-20T10:30Z'))).toBe(-2);
  });
});

describe('DST exact boundaries and disambiguation', () => {
  it.each([
    ['Europe/London', '2026-03-29T01:00:00Z', 0, 60],
    ['Europe/London', '2026-10-25T01:00:00Z', 60, 0],
    ['Australia/Sydney', '2026-04-04T16:00:00Z', 660, 600],
    ['Australia/Sydney', '2026-10-03T16:00:00Z', 600, 660],
    ['Australia/Lord_Howe', '2026-04-04T15:00:00Z', 660, 630],
    ['Australia/Lord_Howe', '2026-10-03T15:30:00Z', 630, 660],
    ['Australia/Adelaide', '2026-10-03T16:30:00Z', 570, 630],
  ] as const)('%s transition %s', (zone, iso, before, after) => {
    const at = utc(iso);
    expect(offsetMinutes(zone, at - 1)).toBe(before);
    expect(offsetMinutes(zone, at)).toBe(after);
    expect(nextTransition(zone, at - MS.DAY, 1)).toEqual({ at, from: before, to: after });
    expect(nextTransition(zone, at - MS.DAY - 1, 1)).toBeNull();
    expect(nextTransition(zone, at, 1)).toBeNull();
    expect(nextTransition(zone, at + 1, 1)).toBeNull();
  });

  it.each([
    ['America/New_York', 2026, 11, 1, 1, 30, '2026-11-01T05:30Z', '2026-11-01T06:30Z'],
    ['Europe/London', 2026, 10, 25, 1, 30, '2026-10-25T00:30Z', '2026-10-25T01:30Z'],
    ['Australia/Sydney', 2026, 4, 5, 2, 30, '2026-04-04T15:30Z', '2026-04-04T16:30Z'],
    ['Australia/Lord_Howe', 2026, 4, 5, 1, 45, '2026-04-04T14:45Z', '2026-04-04T15:15Z'],
  ] as const)('fold %s', (zone, y, m, d, h, min, first, second) => {
    expect(resolveWall(zone, y, m, d, h, min)).toEqual({ kind: 'ambiguous', instant: utc(first), alternatives: [utc(first), utc(second)] });
    expect(resolveWall(zone, y, m, d, h, min, 'earlier').instant).toBe(utc(first));
    expect(resolveWall(zone, y, m, d, h, min, 'later').instant).toBe(utc(second));
    expect(() => resolveWall(zone, y, m, d, h, min, 'reject')).toThrow('Ambiguous');
  });

  it.each([
    ['America/New_York', 2027, 3, 14, 2, 30, 60, '2027-03-14T07:30Z', '2027-03-14T06:30Z'],
    ['Europe/London', 2026, 3, 29, 1, 30, 60, '2026-03-29T01:30Z', '2026-03-29T00:30Z'],
    ['Australia/Lord_Howe', 2026, 10, 4, 2, 15, 30, '2026-10-03T15:45Z', '2026-10-03T15:15Z'],
    ['Pacific/Apia', 2011, 12, 30, 12, 0, 1440, '2011-12-30T22:00Z', '2011-12-29T22:00Z'],
  ] as const)('gap %s', (zone, y, m, d, h, min, gapMinutes, later, earlier) => {
    expect(resolveWall(zone, y, m, d, h, min)).toEqual({ kind: 'nonexistent', instant: utc(later), gapMinutes });
    expect(resolveWall(zone, y, m, d, h, min, 'earlier').instant).toBe(utc(earlier));
    expect(resolveWall(zone, y, m, d, h, min, 'later').instant).toBe(utc(later));
    expect(() => resolveWall(zone, y, m, d, h, min, 'reject')).toThrow('Nonexistent');
  });

  it('does not cache an already-passed Adelaide transition within the same UTC hour', () => {
    expect(nextTransition('Australia/Adelaide', utc('2026-10-03T16:00Z'), 2)?.at).toBe(utc('2026-10-03T16:30Z'));
    expect(nextTransition('Australia/Adelaide', utc('2026-10-03T16:45Z'), 2)).toBeNull();
  });

  it('finds the pre-1847 Manila date-line change with second precision', () => {
    const at = utc('1844-12-31T15:56:08Z');
    expect(nextTransition('Asia/Manila', at - MS.DAY, 2)).toEqual({ at, from: -57368 / 60, to: 29032 / 60 });
    expect(resolveWall('Asia/Manila', 1844, 12, 31, 12, 0)).toMatchObject({ kind: 'nonexistent', gapMinutes: 1440 });
  });

  it('revalidates backwards, shorter, expanded and null cache search bounds', () => {
    const from = utc('2026-10-20T00:00Z');
    expect(nextTransition('Europe/London', from, 1)).toBeNull();
    expect(nextTransition('Europe/London', from, 10)?.at).toBe(utc('2026-10-25T01:00Z'));
    expect(nextTransition('Europe/London', from, 1)).toBeNull();
    expect(nextTransition('Europe/London', from - 10 * MS.DAY, 1)).toBeNull();
    expect(nextTransition('Europe/London', from, 0)).toBeNull();
    expect(nextTransition('UTC', from, 3660)).toBeNull();
    const found = nextTransition('Europe/London', from, 10)!;
    expect(Object.isFrozen(found)).toBe(true);
    expect(() => { (found as { at: number }).at = 0; }).toThrow();
  });

  it('formats both instances without abbreviation cache leakage', () => {
    expect(zoneAbbreviation('America/New_York', utc('2026-11-01T05:59:59Z'))).toBe('EDT');
    expect(zoneAbbreviation('America/New_York', utc('2026-11-01T06:00:00Z'))).toBe('EST');
  });

  it('reuses null transition searches on live ticks without losing a newly included transition', () => {
    const from = utc('2026-01-01T12:00Z');
    expect(nextTransition('Asia/Kathmandu', from, 45)).toBeNull();
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    try {
      expect(nextTransition('Asia/Kathmandu', from + 1000, 45)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    const transition = utc('2026-10-25T01:00Z');
    expect(nextTransition('Europe/London', transition - MS.DAY - 1000, 1)).toBeNull();
    expect(nextTransition('Europe/London', transition - MS.DAY, 1)?.at).toBe(transition);
  });
});

describe('civil day arithmetic', () => {
  it.each([
    ['Europe/London', '2026-03-29T12:00Z', 23],
    ['Europe/London', '2026-10-25T12:00Z', 25],
    ['Australia/Sydney', '2026-04-05T12:00Z', 25],
    ['Australia/Sydney', '2026-10-04T12:00Z', 23],
    ['Australia/Lord_Howe', '2026-04-05T00:00Z', 24.5],
    ['Australia/Lord_Howe', '2026-10-04T00:00Z', 23.5],
    ['UTC', '2028-02-29T12:00Z', 24],
  ] as const)('%s day containing %s is %sh', (zone, iso, hours) => {
    const start = startOfLocalDay(zone, utc(iso));
    expect((addLocalDays(zone, start, 1) - start) / MS.HOUR).toBe(hours);
  });

  it('preserves sub-minute precision while traversing spring/fall dates', () => {
    const start = utc('2026-03-28T12:34:56.789Z');
    const next = addLocalDays('Europe/London', start, 1);
    expect(next).toBe(utc('2026-03-29T11:34:56.789Z'));
    expect(addLocalDays('Europe/London', next, -1)).toBe(start);
    expect(addLocalDays('UTC', utc('2028-02-28T09:00Z'), 1)).toBe(utc('2028-02-29T09:00Z'));
    expect(addLocalDays('UTC', utc('2028-02-29T09:00Z'), 1)).toBe(utc('2028-03-01T09:00Z'));
  });

  it('exposes policies when a target day contains a fold or gap', () => {
    const beforeFold = utc('2026-10-24T00:30Z');
    expect(addLocalDays('Europe/London', beforeFold, 1, 'later')).toBe(utc('2026-10-25T01:30Z'));
    expect(() => addLocalDays('Europe/London', beforeFold, 1, 'reject')).toThrow('Ambiguous');
    const beforeGap = utc('2026-03-28T01:30Z');
    expect(() => addLocalDays('Europe/London', beforeGap, 1, 'reject')).toThrow('Nonexistent');
    const laterFold = utc('2026-10-25T01:30Z');
    expect(addLocalDays('Europe/London', laterFold, 0)).toBe(laterFold);
  });

  it('handles midnight skips, repeated midnights and an entirely skipped date', () => {
    expect(startOfLocalDay('America/Sao_Paulo', utc('2018-11-04T12:00Z'))).toBe(utc('2018-11-04T03:00Z'));
    expect(startOfLocalDay('America/Havana', utc('2024-11-03T12:00Z'))).toBe(utc('2024-11-03T04:00Z'));
    expect(wallTime('Pacific/Apia', addLocalDays('Pacific/Apia', utc('2011-12-29T22:00Z'), 1))).toMatchObject({ year: 2011, month: 12, day: 31, hour: 12 });
  });
});

describe('strict boundary validation', () => {
  it.each([NaN, Infinity, -Infinity, 0.1, '0', null, undefined, MIN_INSTANT - 1, MAX_INSTANT + 1, Number.MAX_SAFE_INTEGER])('rejects invalid instant %s', (value) => {
    expect(() => assertInstant(value)).toThrow(RangeError);
    expect(() => wallTime('UTC', value as number)).toThrow(RangeError);
    expect(() => nextTransition('UTC', value as number)).toThrow(RangeError);
    expect(() => zoneAbbreviation('UTC', value as number)).toThrow(RangeError);
    expect(() => relativeSpan(value as number, 0)).toThrow(RangeError);
  });

  it.each(['', ' UTC', 'UTC ', 'Not/A_Zone', '+05:30', '-08:00', '−08:00', null, undefined, 12, {}, 'x'.repeat(256)])('rejects invalid timezone %s', (zone) => {
    expect(isValidZone(zone)).toBe(false);
    expect(() => normalizeZone(zone)).toThrow();
  });

  it.each([
    [2026, 2, 30, 12, 0], [1900, 2, 29, 12, 0], [2026, 0, 1, 0, 0],
    [2026, 13, 1, 0, 0], [2026, 1, 0, 0, 0], [2026, 4, 31, 0, 0],
    [0, 1, 1, 0, 0], [10000, 1, 1, 0, 0], [2026, 1, 1, 24, 0],
    [2026, 1, 1, -1, 0], [2026, 1, 1, 0, 60], [2026, 1, 1, 0, -1],
    [2026.5, 1, 1, 0, 0], [2026, NaN, 1, 0, 0], [2026, 1, 1, 0, 0.5],
  ])('rejects invalid local fields %j', (y, m, d, h, min) => {
    expect(() => resolveWall('UTC', y, m, d, h, min)).toThrow(RangeError);
  });

  it('never coerces fields or policies, rejects overflow results, and accepts Gregorian century leap days', () => {
    expect(() => resolveWall('UTC', '2026' as unknown as number, 1, 1, 0, 0)).toThrow();
    expect(() => resolveWall('UTC', 2026, 1, 1, 0, 0, 'invalid' as 'reject')).toThrow();
    expect(() => addLocalDays('UTC', 0, 0, null as unknown as 'reject')).toThrow();
    expect(() => addLocalDays('UTC', MAX_INSTANT, 1)).toThrow();
    expect(() => addLocalDays('UTC', MIN_INSTANT, -1)).toThrow();
    expect(resolveWall('UTC', 2000, 2, 29, 0, 0).kind).toBe('ok');
    expect(resolveWall('UTC', 1, 1, 1, 0, 0).instant).toBe(MIN_INSTANT);
    expect(wallTime('UTC', MAX_INSTANT).year).toBe(9999);
    expect(() => wallTime('Pacific/Kiritimati', MAX_INSTANT)).toThrow();
    expect(() => wallTime('America/New_York', MIN_INSTANT)).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, 3661])('rejects invalid transition horizon %s', (horizon) => {
    expect(() => nextTransition('UTC', 0, horizon)).toThrow();
  });

  it.each([0.5, Infinity, NaN, 3652059, '1'])('rejects invalid day increment %s', (days) => {
    expect(() => addLocalDays('UTC', 0, days as number)).toThrow();
  });

  it('normalizes case and aliases without conflating same-offset regions', () => {
    expect(normalizeZone('america/new_york')).toBe('America/New_York');
    expect(normalizeZone('US/Eastern')).toBe(normalizeZone('America/New_York'));
    expect(normalizeZone('Etc/UTC')).toBe('UTC');
    expect(normalizeZone('Asia/Manila')).not.toBe(normalizeZone('Asia/Singapore'));
    expect(offsetMinutes('Etc/GMT+5', 0)).toBe(-300);
  });

  it('falls back safely if runtime zone detection is missing, invalid or throws', () => {
    expect(isValidZone(systemZone())).toBe(true);
    expect(systemZone(() => 'US/Eastern')).toBe('America/New_York');
    expect(systemZone(() => undefined)).toBe('UTC');
    expect(systemZone(() => 'invalid')).toBe('UTC');
    expect(systemZone(() => { throw new Error('unavailable'); })).toBe('UTC');
  });

  it('does not depend on the host timezone or locale defaults', () => {
    const spy = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(() => { throw new Error('OS offset is not a zone engine'); });
    try { expect(formatTimeString('Asia/Manila', utc('2026-10-20T13:00Z'), format)).toBe('9:00 PM'); }
    finally { spy.mockRestore(); }
  });
});

describe('format contracts', () => {
  const at = utc('2026-10-20T13:00Z');
  it('keeps the current display contract for 12/24-hour clocks and dates', () => {
    expect(formatTime('Asia/Manila', at, format)).toEqual({ time: '9:00', period: 'PM' });
    expect(formatTimeString('Asia/Manila', at, { hour12: false })).toBe('21:00');
    expect(formatTimeString('UTC', utc('2026-01-01T00:00Z'), format)).toBe('12:00 AM');
    expect(formatTimeString('UTC', utc('2026-01-01T12:00Z'), format)).toBe('12:00 PM');
    expect(formatShortDate('Asia/Manila', at)).toBe('Tue 20 Oct');
    expect(formatLongDate('Asia/Manila', at)).toBe('Tuesday, October 20, 2026');
    expect(formatDateTimeShort('Asia/Manila', at, format)).toBe('Tue 20 Oct, 9:00 PM');
    expect(minuteOfDay('Asia/Manila', at)).toBe(1260);
    expect(formatOffset(0)).toBe('UTC');
    expect(formatOffset(-210)).toBe('UTC−3:30');
    expect(formatOffset(345)).toBe('UTC+5:45');
    expect(formatDiff(-330)).toBe('−5h 30m');
    expect(formatDiff(9.35)).toBe('+9m 21s');
    expect(formatDiff(0)).toBe('Same time');
  });

  it('relative labels compare civil dates and validate formats', () => {
    expect(relativeDay('Asia/Manila', at, at)).toBe('Today');
    expect(relativeDay('UTC', at + MS.DAY, at)).toBe('Tomorrow');
    expect(relativeDay('UTC', at - MS.DAY, at)).toBe('Yesterday');
    expect(relativeDay('UTC', at + 3 * MS.DAY, at)).toBe('In 3 days');
    expect(relativeDay('UTC', at - 3 * MS.DAY, at)).toBe('3 days ago');
    expect(relativeSpan(at + 65 * MS.MIN, at)).toBe('in 1h 5m');
    expect(relativeSpan(at - 60 * MS.MIN, at)).toBe('1h ago');
    expect(() => formatTime('UTC', at, { hour12: 'yes' } as unknown as typeof format)).toThrow();
    expect(() => formatTime('UTC', at, null as unknown as typeof format)).toThrow();
    expect(() => formatOffset(Infinity)).toThrow();
    expect(() => formatOffset(1440)).toThrow();
    expect(() => formatDiff(NaN)).toThrow();
  });
});

describe('runtime IANA coverage and Intl/Temporal agreement', () => {
  const zones = [...Intl.supportedValuesOf('timeZone'), 'UTC'];
  it.each(zones)('%s projects and roundtrips across representative dates', (zone) => {
    for (const iso of ['1900-01-01T00:00Z', '2026-01-15T12:34Z', '2026-07-15T12:34Z', '2028-02-29T12:34Z']) {
      const at = utc(iso);
      const w = wallTime(zone, at);
      const z = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone);
      expect(w).toEqual({ year: z.year, month: z.month, day: z.day, hour: z.hour, minute: z.minute, second: z.second, weekday: z.dayOfWeek % 7 });
      expect(offsetSeconds(zone, at)).toBe(z.offsetNanoseconds / 1e9);
      // Minute-only wall entry intentionally loses the source seconds. For
      // second-based historical offsets resolve returns local :00 precisely.
      const r = resolveWall(zone, w.year, w.month, w.day, w.hour, w.minute);
      expect(wallTime(zone, r.instant)).toMatchObject({ year: w.year, month: w.month, day: w.day, hour: w.hour, minute: w.minute, second: 0 });
    }
  });
});
