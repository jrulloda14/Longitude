/**
 * Timezone engine — pure functions, no React, no platform APIs.
 *
 * Intl handles cached display projections; Temporal handles civil-time
 * resolution and calendar arithmetic. Transitions use bounded Intl offset
 * searches. Both use runtime IANA data.
 * No React, native bridge, window, storage, or OS-specific imports belong here.
 *
 * Instants are plain epoch milliseconds (number). "Wall" values are the
 * civil date/time a person in that zone would read off their wall clock.
 */
import { Temporal } from '@js-temporal/polyfill';
import { TimeCache } from './time-cache';
import { MAX_INSTANT, assertInstant, assertInteger, assertTimeFormat, civilUtc, normalizeZone } from './time-validation';
export { MIN_INSTANT, MAX_INSTANT, assertInstant, normalizeZone } from './time-validation';

export type Instant = number;

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const partsCache = new TimeCache<string, Intl.DateTimeFormat>(256);
function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23', calendar: 'gregory', numberingSystem: 'latn', era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    partsCache.set(zone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Is this string a zone the runtime's tz database knows? */
export function isValidZone(zone: unknown): zone is string {
  try {
    normalizeZone(zone);
    return true;
  } catch {
    return false;
  }
}

/** Runtime zone detection; injected reader allows platform-neutral failure tests. */
export function systemZone(read: () => unknown = () => Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  try { return normalizeZone(read()); } catch { return 'UTC'; }
}

export function wallTime(zone: string, at: Instant): WallTime {
  assertInstant(at);
  zone = normalizeZone(zone);
  const out: Partial<WallTime> = {};
  let bc = false;
  for (const p of partsFormatter(zone).formatToParts(new Date(at))) {
    switch (p.type) {
      case 'year': out.year = +p.value; break;
      case 'month': out.month = +p.value; break;
      case 'day': out.day = +p.value; break;
      case 'hour': out.hour = +p.value % 24; break;
      case 'minute': out.minute = +p.value; break;
      case 'second': out.second = +p.value; break;
      case 'weekday': out.weekday = WEEKDAYS[p.value]; break;
      case 'era': bc = p.value === 'BC'; break;
    }
  }
  if (bc || !out.year || out.year > 9999 || Object.keys(out).length !== 7 || out.weekday === undefined) {
    throw new RangeError('Local civil date is outside ISO years 0001–9999 or unavailable in runtime Intl');
  }
  return out as WallTime;
}

/** Exact offset including historical seconds; no whole-minute rounding. */
export function offsetSeconds(zone: string, at: Instant): number {
  const w = wallTime(zone, at);
  const asUtc = civilUtc(w.year, w.month, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(at / 1000) * 1000;
  return (asUtc - truncated) / 1000;
}

/** Minutes may be fractional for historical offsets that include seconds. */
export function offsetMinutes(zone: string, at: Instant): number {
  return offsetSeconds(zone, at) / 60;
}

/** Minutes since local midnight (0–1439). */
export function minuteOfDay(zone: string, at: Instant): number {
  const w = wallTime(zone, at);
  return w.hour * 60 + w.minute;
}

/** Days since epoch of the local civil date — compare two zones' dates. */
export function dayNumber(zone: string, at: Instant): number {
  const w = wallTime(zone, at);
  return Math.floor(civilUtc(w.year, w.month, w.day) / DAY);
}

/** Local calendar-day difference (can reach ±2 across the date line). */
export function dayShift(zone: string, refZone: string, at: Instant): number {
  return dayNumber(zone, at) - dayNumber(refZone, at);
}

export type WallResolution =
  | { kind: 'ok'; instant: Instant }
  | { kind: 'ambiguous'; instant: Instant; alternatives: [Instant, Instant] }
  | { kind: 'nonexistent'; instant: Instant; gapMinutes: number };

export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

function assertDisambiguation(value: unknown): asserts value is Disambiguation {
  if (!['compatible', 'earlier', 'later', 'reject'].includes(value as string)) {
    throw new RangeError('Disambiguation must be compatible, earlier, later, or reject');
  }
}

function checkedZoned(zone: string, at: Instant): Temporal.ZonedDateTime {
  assertInstant(at);
  const result = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(normalizeZone(zone));
  assertInteger(result.year, 1, 9999, 'Local year');
  return result;
}

function resolvePlain(zone: string, plain: Temporal.PlainDateTime, policy: Disambiguation): WallResolution {
  assertDisambiguation(policy);
  const earlier = plain.toZonedDateTime(zone, { disambiguation: 'earlier' });
  const later = plain.toZonedDateTime(zone, { disambiguation: 'later' });
  const sameInstant = earlier.epochMilliseconds === later.epochMilliseconds;
  const ambiguous = !sameInstant && earlier.toPlainDateTime().equals(plain) && later.toPlainDateTime().equals(plain);
  if (!sameInstant && policy === 'reject') throw new RangeError(ambiguous ? 'Ambiguous local time' : 'Nonexistent local time');
  const chosen = policy === 'earlier' ? earlier : policy === 'later' ? later : ambiguous ? earlier : later;
  assertInstant(chosen.epochMilliseconds);
  assertInteger(chosen.year, 1, 9999, 'Resolved local year');
  if (sameInstant) return { kind: 'ok', instant: chosen.epochMilliseconds };
  if (ambiguous) {
    return { kind: 'ambiguous', instant: chosen.epochMilliseconds, alternatives: [earlier.epochMilliseconds, later.epochMilliseconds] };
  }
  return { kind: 'nonexistent', instant: chosen.epochMilliseconds, gapMinutes: (later.epochMilliseconds - earlier.epochMilliseconds) / MIN };
}

/**
 * Convert a wall time in `zone` to an instant. Detects the two DST edge cases:
 *  - ambiguous: the wall time happens twice (clocks fall back). Returns the
 *    earlier instant by default and both alternatives.
 *  - nonexistent: the wall time is skipped (clocks spring forward). Returns the
 *    instant after the gap by default and the gap length. An explicit policy
 *    can choose earlier/later or reject either discontinuity.
 */
export function resolveWall(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  policy: Disambiguation = 'compatible',
): WallResolution {
  zone = normalizeZone(zone);
  assertInteger(year, 1, 9999, 'Year');
  assertInteger(month, 1, 12, 'Month');
  assertInteger(day, 1, 31, 'Day');
  assertInteger(hour, 0, 23, 'Hour');
  assertInteger(minute, 0, 59, 'Minute');
  const plain = Temporal.PlainDateTime.from({ year, month, day, hour, minute }, { overflow: 'reject' });
  return resolvePlain(zone, plain, policy);
}

/** Instant of local midnight starting the civil day that contains `at` in `zone`. */
export function startOfLocalDay(zone: string, at: Instant): Instant {
  // startOfDay is the first actual instant of this civil date, even if midnight
  // was skipped or repeated. Resolving nonexistent 00:00 can land too late.
  const start = checkedZoned(zone, at).startOfDay().epochMilliseconds;
  assertInstant(start);
  return start;
}

/** Add whole civil days in `zone`, keeping wall time (DST-safe). */
export function addLocalDays(zone: string, at: Instant, days: number, policy: Disambiguation = 'compatible'): Instant {
  const zoned = checkedZoned(zone, at);
  assertInteger(days, -3_652_058, 3_652_058, 'Days');
  assertDisambiguation(policy);
  if (days === 0) return at; // preserve the second occurrence of a fold
  const target = zoned.toPlainDateTime().add({ days });
  assertInteger(target.year, 1, 9999, 'Target year');
  return resolvePlain(normalizeZone(zone), target, policy).instant;
}

export interface OffsetTransition {
  readonly at: Instant; // first instant with the new offset
  readonly from: number; // minutes, historical seconds retained as fractions
  readonly to: number;
}

const transitionCache = new TimeCache<string, { from: Instant; until: Instant; next: OffsetTransition | null }>(256);

/**
 * Next UTC-offset change for `zone` after `from`, within `horizonDays`.
 * Offset transition, strictly after from, at/before the elapsed-day
 * horizon. Reuse only cache entries whose searched interval covers the query.
 */
export function nextTransition(zone: string, from: Instant, horizonDays = 45): OffsetTransition | null {
  assertInstant(from);
  zone = normalizeZone(zone);
  assertInteger(horizonDays, 0, 3660, 'Transition horizon days');
  if (horizonDays === 0 || zone === 'UTC') return null;
  const until = Math.min(MAX_INSTANT, from + horizonDays * DAY);
  const cached = transitionCache.get(zone);
  if (cached && from >= cached.from) {
    if (cached.next && from < cached.next.at) return cached.next.at <= until ? cached.next : null;
    if (!cached.next && until <= cached.until) return null;
  }
  // Search the requested interval plus bounded cache look-ahead. The polyfill's
  // iterator skips pre-1847 transitions and caps future searches at 3 years;
  // it cannot satisfy this API's historical/10-year horizon contract.
  // Six-hour probes cover IANA's separated transitions, then bisect to the
  // first millisecond. A hypothetical offset that changes and returns within
  // six hours cannot be discovered from Intl alone (see TIMEZONE_ENGINE.md).
  // Cache a small look-ahead too, otherwise a null result for a live clock
  // expires every second as the requested horizon advances by one second.
  const searchedUntil = Math.min(MAX_INSTANT, Math.ceil(until / DAY) * DAY + DAY);
  let left = from;
  const before = offsetMinutes(zone, from);
  let result: OffsetTransition | null = null;
  while (left < searchedUntil) {
    const right = Math.min(left + 6 * HOUR, searchedUntil);
    const after = offsetMinutes(zone, right);
    if (after !== before) {
      let lo = left;
      let hi = right;
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (offsetMinutes(zone, mid) === before) lo = mid;
        else hi = mid;
      }
      result = Object.freeze({ at: hi, from: before, to: after });
      break;
    }
    left = right;
  }
  transitionCache.set(zone, { from, until: searchedUntil, next: result });
  return result && result.at <= until ? result : null;
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatOffset(mins: number): string {
  if (!Number.isFinite(mins) || Math.abs(mins) >= 1440) throw new RangeError('Offset must be finite and less than 24 hours');
  if (mins === 0) return 'UTC';
  const sign = mins > 0 ? '+' : '−';
  const seconds = Math.round(Math.abs(mins) * 60);
  if (seconds >= 86400) throw new RangeError('Rounded offset must be less than 24 hours');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  return `UTC${sign}${h}${m || s ? ':' + String(m).padStart(2, '0') : ''}${s ? ':' + String(s).padStart(2, '0') : ''}`;
}

/** "+12h", "−5h 30m", "Same time". Input in minutes. */
export function formatDiff(mins: number): string {
  if (!Number.isFinite(mins)) throw new RangeError('Difference must be finite');
  if (mins === 0) return 'Same time';
  const sign = mins > 0 ? '+' : '−';
  const seconds = Math.round(Math.abs(mins) * 60);
  if (seconds === 0) return 'Same time';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  return sign + [h ? `${h}h` : '', m ? `${m}m` : '', s ? `${s}s` : ''].filter(Boolean).join(' ');
}

const abbrCache = new TimeCache<string, Intl.DateTimeFormat>(512);
/** Short alphabetic abbreviation when the runtime has one (EDT, BST, JST); else UTC±h. */
export function zoneAbbreviation(zone: string, at: Instant): string {
  assertInstant(at);
  zone = normalizeZone(zone);
  let result = '';
  for (const locale of ['en-US', 'en-GB', 'en-AU', 'en-IN']) {
    const key = `${locale}|${zone}`;
    const formatter = abbrCache.get(key) ?? abbrCache.set(key, new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' }));
    const name = formatter
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value;
    if (name && /^[A-Z]{2,5}$/.test(name)) {
      result = name;
      break;
    }
  }
  if (!result) result = formatOffset(offsetMinutes(zone, at));
  return result;
}

export interface TimeFormat {
  hour12: boolean;
}

export function formatTime(zone: string, at: Instant, fmt: TimeFormat): { time: string; period: string } {
  assertTimeFormat(fmt);
  const w = wallTime(zone, at);
  const mm = String(w.minute).padStart(2, '0');
  if (!fmt.hour12) return { time: `${String(w.hour).padStart(2, '0')}:${mm}`, period: '' };
  const h = w.hour % 12 || 12;
  return { time: `${h}:${mm}`, period: w.hour < 12 ? 'AM' : 'PM' };
}

export function formatTimeString(zone: string, at: Instant, fmt: TimeFormat): string {
  const { time, period } = formatTime(zone, at, fmt);
  return period ? `${time} ${period}` : time;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Mon 19 Oct" */
export function formatShortDate(zone: string, at: Instant): string {
  const w = wallTime(zone, at);
  return `${DAYS[w.weekday]} ${w.day} ${MONTHS[w.month - 1]}`;
}

/** "Tuesday, October 20, 2026" */
export function formatLongDate(zone: string, at: Instant): string {
  const w = wallTime(zone, at);
  return `${DAYS_LONG[w.weekday]}, ${MONTHS_LONG[w.month - 1]} ${w.day}, ${w.year}`;
}

export function formatDateTimeShort(zone: string, at: Instant, fmt: TimeFormat): string {
  return `${formatShortDate(zone, at)}, ${formatTimeString(zone, at, fmt)}`;
}

/** Relative-day word for `at` vs `now` in `zone`: Today / Tomorrow / Yesterday / +3 days. */
export function relativeDay(zone: string, at: Instant, now: Instant): string {
  const d = dayNumber(zone, at) - dayNumber(zone, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

/** "in 3h 25m" / "2h ago" / "now" */
export function relativeSpan(at: Instant, now: Instant): string {
  assertInstant(at);
  assertInstant(now);
  const mins = Math.round((at - now) / MIN);
  if (Math.abs(mins) < 1) return 'now';
  const a = Math.abs(mins);
  const d = Math.floor(a / 1440);
  const h = Math.floor((a % 1440) / 60);
  const m = a % 60;
  const s = [d ? `${d}d` : '', h ? `${h}h` : '', m && !d ? `${m}m` : ''].filter(Boolean).join(' ');
  return mins > 0 ? `in ${s}` : `${s} ago`;
}

export const MS = { MIN, HOUR, DAY };
