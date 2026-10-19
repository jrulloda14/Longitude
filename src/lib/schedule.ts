/** Offline suitability from configured local hours, never calendar availability. */
import { MS, Instant, MIN_INSTANT, MAX_INSTANT, assertInstant, normalizeZone, nextTransition, offsetSeconds, resolveWall, wallTime } from './time';
import { assertInteger } from './time-validation';
import { civilUtc } from './time-validation';
import { TimeCache } from './time-cache';

export interface WorkInterval { start: number; end: number }
export interface WorkingHours extends WorkInterval {
  /** Shift START weekdays, Sunday=0. Empty means no working days. */
  days: number[];
  /** When present, replaces the legacy start/end pair. All share start weekdays. */
  intervals?: WorkInterval[];
}
export interface SleepHours extends WorkInterval {}
export const DEFAULT_WORK: WorkingHours = { start: 540, end: 1050, days: [1, 2, 3, 4, 5] };
export const DEFAULT_SLEEP: SleepHours = { start: 1380, end: 420 };
export type DayState = 'work' | 'edge' | 'off' | 'sleep';
export interface Participant { id: string; label: string; zone: string; work: WorkingHours; sleep: SleepHours }
export interface Range { start: Instant; end: Instant }
export interface StateRange extends Range { state: DayState }
export const SCHEDULE_LIMITS = { participants: 32, intervals: 8, days: 31, candidates: 5000, durationMin: 1440 } as const;
const STATES: DayState[] = ['work', 'edge', 'off', 'sleep'];
const WEIGHTS = [0, 1, 3, 8];
const cache = new TimeCache<string, Compiled>(64);
const calendarDates = new TimeCache<string, boolean>(1024);
function dateExists(zone: string, date: number): boolean {
  const key = `${zone}:${date}`, cached = calendarDates.get(key); if (cached !== undefined) return cached;
  const d = new Date(date), year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate();
  const w = wallTime(zone, resolveWall(zone, year, month, day, 0, 0).instant);
  return calendarDates.set(key, w.year === year && w.month === month && w.day === day);
}

export function workIntervals(work: WorkingHours): WorkInterval[] { return work.intervals ?? [{ start: work.start, end: work.end }]; }
function interval(i: WorkInterval, name: string, equal = false) {
  if (!i || typeof i !== 'object') throw new TypeError(`${name} is required`);
  assertInteger(i.start, 0, 1439, `${name} start`); assertInteger(i.end, 0, 1440, `${name} end`);
  if (!equal && i.start === i.end) throw new RangeError(`${name} start and end must differ`);
}
export function validateHours(work: WorkingHours, sleep: SleepHours): void {
  if (!work || !Array.isArray(work.days) || work.days.length > 7 || new Set(work.days).size !== work.days.length) throw new RangeError('Use unique working weekdays');
  for (const d of work.days) assertInteger(d, 0, 6, 'Weekday');
  interval(work, 'Work');
  if (work.intervals !== undefined && (!Array.isArray(work.intervals) || work.intervals.length < 1 || work.intervals.length > SCHEDULE_LIMITS.intervals)) throw new RangeError('Use one to eight work intervals');
  for (const i of workIntervals(work)) interval(i, 'Work interval');
  interval(sleep, 'Sleep', true);
}
/** A configuration warning: sleeping hours conservatively override work. */
export function workSleepConflict(work: WorkingHours, sleep: SleepHours): boolean {
  validateHours(work, sleep);
  if (!work.days.length) return false;
  return Array.from({ length: 1440 }, (_, m) => m).some(m => includes(m, sleep) && workIntervals(work).some(i => includes(m, i)));
}
function participant(p: Participant | Pick<Participant, 'zone' | 'work' | 'sleep'>) { normalizeZone(p.zone); validateHours(p.work, p.sleep); }
function participants(people: Participant[]) {
  if (!Array.isArray(people) || people.length > SCHEDULE_LIMITS.participants) throw new RangeError('Use at most 32 participants');
  const ids = new Set<string>();
  for (const p of people) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.label !== 'string') throw new RangeError('Participant IDs must be unique nonempty strings');
    ids.add(p.id); participant(p);
  }
}
function bounds(from: Instant, to: Instant) {
  assertInstant(from); assertInstant(to);
  if (from < MIN_INSTANT + 2 * MS.DAY || to > MAX_INSTANT - 2 * MS.DAY || to <= from || to - from > SCHEDULE_LIMITS.days * MS.DAY) throw new RangeError('Schedule range must be positive, at most 31 elapsed days, and two days inside the instant envelope');
}
function duration(minutes: number) { assertInteger(minutes, 1, SCHEDULE_LIMITS.durationMin, 'Duration'); }
const extent = (i: WorkInterval) => i.end + (i.end < i.start ? 1440 : 0);
const includes = (m: number, i: WorkInterval) => i.start === i.end ? false : i.start < i.end ? m >= i.start && m < i.end : m >= i.start || m < i.end;

/** Exact wall predicate; overnight tails belong to the previous shift-start day. */
export function dayState(p: Pick<Participant, 'zone' | 'work' | 'sleep'>, at: Instant): DayState {
  participant(p); const w = wallTime(p.zone, at);
  const m = w.hour * 60 + w.minute + w.second / 60 + ((at % 1000 + 1000) % 1000) / MS.MIN;
  if (includes(m, p.sleep)) return 'sleep';
  let edge = false;
  for (const d of [-1, 0, 1]) if (p.work.days.includes((w.weekday + d + 7) % 7)) {
    for (const i of workIntervals(p.work)) {
      const start = d * 1440 + i.start, end = d * 1440 + extent(i);
      const inside = m >= start && m < end;
      const nearby = m >= start - 60 && m < start || m >= end && m < end + 60;
      if ((inside || nearby) && (d === 0 || dateExists(p.zone, civilUtc(w.year, w.month, w.day) + d * MS.DAY))) {
        if (inside) return 'work';
        edge = true;
      }
    }
  }
  return edge ? 'edge' : 'off';
}

interface Compiled { ranges: readonly StateRange[]; starts: readonly number[]; prefix: readonly (readonly number[])[] }
/** Expand civil ranges only inside segments with a constant engine-provided offset.
 * Repeated local intervals appear twice; nonexistent local minutes appear zero times.
 * UTC Date is used only to enumerate Gregorian dates/weekdays, never to resolve a zone.
 */
function compile(p: Pick<Participant, 'zone' | 'work' | 'sleep'>, from: Instant, to: Instant): Compiled {
  const key = JSON.stringify([p.zone, p.work, p.sleep, from, to]);
  const cached = cache.get(key); if (cached) return cached;
  const cuts = [from]; let cursor = from;
  for (let n = 0; n < 256; n++) {
    const t = nextTransition(p.zone, cursor, Math.ceil((to - cursor) / MS.DAY));
    if (!t || t.at >= to) break;
    cuts.push(t.at); cursor = t.at;
    if (n === 255) throw new RangeError('Too many timezone transitions');
  }
  cuts.push(to);
  const events = new Map<number, number[]>();
  const event = (at: number, kind: number, delta: number) => {
    let counts = events.get(at); if (!counts) { counts = [0, 0, 0]; events.set(at, counts); }
    counts[kind] += delta;
  };
  events.set(from, [0, 0, 0]); events.set(to, [0, 0, 0]);
  for (let s = 0; s < cuts.length - 1; s++) {
    const a = cuts[s], b = cuts[s + 1], offset = offsetSeconds(p.zone, a) * 1000;
    const add = (lo: number, hi: number, kind: number) => {
      const start = Math.max(a, lo - offset), end = Math.min(b, hi - offset);
      if (end > start) { event(start, kind, 1); event(end, kind, -1); }
    };
    const first = Math.floor((a + offset) / MS.DAY) * MS.DAY - MS.DAY;
    const last = Math.floor((b - 1 + offset) / MS.DAY) * MS.DAY + MS.DAY;
    for (let date = first; date <= last; date += MS.DAY) {
      if (p.work.days.includes(new Date(date).getUTCDay()) && dateExists(p.zone, date)) for (const i of workIntervals(p.work)) {
        const start = date + i.start * MS.MIN, end = date + extent(i) * MS.MIN;
        add(start, end, 0); add(start - MS.HOUR, start, 1); add(end, end + MS.HOUR, 1);
      }
      if (p.sleep.start !== p.sleep.end) add(date + p.sleep.start * MS.MIN, date + extent(p.sleep) * MS.MIN, 2);
    }
  }
  const positions = [...events.keys()].sort((a, b) => a - b), counts = [0, 0, 0];
  const ranges: StateRange[] = [];
  for (let j = 0; j < positions.length - 1; j++) {
    const start = positions[j], end = positions[j + 1], deltas = events.get(start)!;
    deltas.forEach((d, i) => counts[i] += d);
    const state: DayState = counts[2] > 0 ? 'sleep' : counts[0] > 0 ? 'work' : counts[1] > 0 ? 'edge' : 'off';
    const previous = ranges.at(-1);
    if (previous?.state === state) previous.end = end; else ranges.push({ start, end, state });
  }
  const prefix: number[][] = [[0, 0, 0, 0]];
  for (const range of ranges) { const next = [...prefix.at(-1)!]; next[STATES.indexOf(range.state)] += range.end - range.start; prefix.push(next); Object.freeze(range); }
  return cache.set(key, { ranges: Object.freeze(ranges), starts: ranges.map(r => r.start), prefix });
}
export function stateRanges(p: Pick<Participant, 'zone' | 'work' | 'sleep'>, from: Instant, to: Instant): StateRange[] {
  participant(p); bounds(from, to); return compile(p, from, to).ranges.map(r => ({ ...r }));
}
function integral(c: Compiled, at: Instant): number[] {
  let lo = 0, hi = c.starts.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (c.starts[mid] <= at) lo = mid + 1; else hi = mid; }
  const i = Math.max(0, lo - 1), range = c.ranges[i], total = [...c.prefix[i]];
  total[STATES.indexOf(range.state)] += Math.min(at, range.end) - range.start;
  return total;
}
function measure(c: Compiled, from: Instant, to: Instant) {
  const a = integral(c, from), b = integral(c, to); return b.map((n, i) => n - a[i]);
}
const worst = (amounts: number[]) => STATES[amounts[3] > 0 ? 3 : amounts[2] > 0 ? 2 : amounts[1] > 0 ? 1 : 0];
export function stateDuring(p: Participant, start: Instant, durationMin: number): DayState {
  duration(durationMin); participant(p); bounds(start, start + durationMin * MS.MIN);
  return worst(measure(compile(p, start, start + durationMin * MS.MIN), start, start + durationMin * MS.MIN));
}
export type OverlapLevel = 'good' | 'partial' | 'poor' | 'none';
export interface OverlapVerdict {
  level: OverlapLevel; headline: string;
  people: { id: string; label: string; state: DayState; workingMin: number; sleepingMin: number; burden: number }[];
  /** Sum of exact per-person weighted minutes divided by meeting duration. */
  cost: number;
}
function verdict(people: Participant[], profiles: Compiled[], start: Instant, durationMin: number): OverlapVerdict {
  if (!people.length) return { level: 'none', headline: 'Add locations to compare', people: [], cost: 0 };
  const rows = people.map((p, i) => {
    const m = measure(profiles[i], start, start + durationMin * MS.MIN);
    return { id: p.id, label: p.label, state: worst(m), workingMin: m[0] / MS.MIN, sleepingMin: m[3] / MS.MIN, burden: m.reduce((sum, n, j) => sum + n / MS.MIN * WEIGHTS[j], 0) / durationMin };
  });
  const n = rows.length, working = rows.filter(r => r.state === 'work').length, asleep = rows.filter(r => r.state === 'sleep').length;
  return { level: working === n ? 'good' : asleep || working < n / 2 ? 'poor' : 'partial',
    headline: working === n ? n === 1 ? 'Within working hours' : `Within working hours for all ${n}` : asleep ? `${asleep === 1 ? '1 location is' : asleep + ' locations are'} in sleeping hours` : `Outside working hours for ${n - working} of ${n}`,
    people: rows, cost: rows.reduce((sum, r) => sum + r.burden, 0) };
}
export function evaluate(people: Participant[], start: Instant, durationMin: number): OverlapVerdict {
  participants(people); duration(durationMin); const end = start + durationMin * MS.MIN; bounds(start, end);
  return verdict(people, people.map(p => compile(p, start, end)), start, durationMin);
}
function common(profiles: Compiled[], from: Instant, to: Instant): Range[] {
  if (!profiles.length) return [];
  const events = new Map<number, number>();
  for (const p of profiles) for (const r of p.ranges) if (r.state === 'work') {
    events.set(r.start, (events.get(r.start) ?? 0) + 1); events.set(r.end, (events.get(r.end) ?? 0) - 1);
  }
  let count = 0, open: number | null = null; const ranges: Range[] = [];
  for (const at of [...events.keys()].sort((a, b) => a - b)) {
    count += events.get(at)!;
    if (count === profiles.length && open === null) open = Math.max(from, at);
    if (count !== profiles.length && open !== null) { ranges.push({ start: open, end: Math.min(to, at) }); open = null; }
  }
  return ranges;
}
/** Exact intersections. Legacy step is validated for compatibility, never used to sample. */
export function commonWorkingRanges(people: Participant[], from: Instant, to: Instant, step = 15): Range[] {
  participants(people); bounds(from, to); assertInteger(step, 1, 1440, 'Step');
  return common(people.map(p => compile(p, from, to)), from, to);
}
export interface SearchOptions {
  participantIds?: string[];
  preferred?: { zone: string; start: number; end: number };
  /** Number fully inside working hours for the ENTIRE meeting. */
  minParticipants?: number;
  /** Simultaneous shared working minutes for all selected participants inside the meeting. */
  minOverlapMin?: number;
  fairness?: boolean;
  /** Prior normalized burden, supplied explicitly; no implicit tracking or persistence. */
  priorBurden?: Record<string, number>;
  separationMin?: number;
}
export interface Suggestion { start: Instant; verdict: OverlapVerdict; score: number[]; reasons: string[]; overlapMin: number; fullWorkCount: number }
export function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
/** Bounded elapsed-start grid. Duration must fit wholly inside [from,to). */
export function suggestTimes(people: Participant[], from: Instant, to: Instant, durationMin: number, near: Instant, count = 3, step = 30, options: SearchOptions = {}): Suggestion[] {
  participants(people); bounds(from, to); duration(durationMin); assertInstant(near);
  assertInteger(count, 1, 50, 'Count'); assertInteger(step, 1, 1440, 'Step');
  if (typeof options !== 'object' || options === null || Array.isArray(options)) throw new TypeError('Search options must be an object');
  if (options.participantIds !== undefined) {
    if (!Array.isArray(options.participantIds) || new Set(options.participantIds).size !== options.participantIds.length || options.participantIds.some(id => !people.some(p => p.id === id))) throw new RangeError('Select unique known participant IDs');
    people = people.filter(p => options.participantIds!.includes(p.id));
  }
  const minParticipants = options.minParticipants === undefined ? 0 : options.minParticipants;
  const minOverlap = options.minOverlapMin === undefined ? 0 : options.minOverlapMin;
  const separation = options.separationMin === undefined ? 90 : options.separationMin;
  assertInteger(minParticipants, 0, people.length, 'Minimum working participants'); assertInteger(minOverlap, 0, durationMin, 'Minimum shared minutes'); assertInteger(separation, 0, 1440, 'Separation');
  if (options.fairness !== undefined && typeof options.fairness !== 'boolean') throw new TypeError('Fairness must be boolean');
  if (options.priorBurden !== undefined) {
    if (!options.priorBurden || typeof options.priorBurden !== 'object' || Array.isArray(options.priorBurden)) throw new TypeError('Prior burden must be a record');
    for (const [id, n] of Object.entries(options.priorBurden)) if (!people.some(p => p.id === id) || typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e6) throw new RangeError('Prior burden must be finite, nonnegative, bounded and keyed by selected participant');
  }
  const candidates = Math.max(0, Math.floor((to - from - durationMin * MS.MIN) / (step * MS.MIN)) + 1);
  if (candidates > SCHEDULE_LIMITS.candidates) throw new RangeError('Search exceeds 5000 candidate starts; increase the step or shorten the range');
  let preferred: Compiled | null = null;
  if (options.preferred !== undefined) {
    if (!options.preferred || typeof options.preferred !== 'object' || Array.isArray(options.preferred)) throw new TypeError('Preferred window must be an object');
    const p = { zone: options.preferred.zone, work: { start: options.preferred.start, end: options.preferred.end, days: [0, 1, 2, 3, 4, 5, 6] }, sleep: { start: 0, end: 0 } };
    participant(p); preferred = compile(p, from, to);
  }
  if (!people.length) return [];
  people = [...people].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const profiles = people.map(p => compile(p, from, to));
  const shared = common(profiles, from, to);
  const all: Suggestion[] = [];
  for (let k = 0; k < candidates; k++) {
    const start = from + k * step * MS.MIN, end = start + durationMin * MS.MIN;
    if (preferred && measure(preferred, start, end)[0] !== durationMin * MS.MIN) continue;
    const v = verdict(people, profiles, start, durationMin), fullWorkCount = v.people.filter(p => p.state === 'work').length;
    if (fullWorkCount < minParticipants) continue;
    const overlapMin = shared.reduce((sum, r) => sum + Math.max(0, Math.min(end, r.end) - Math.max(start, r.start)), 0) / MS.MIN;
    if (overlapMin < minOverlap) continue;
    const amounts = profiles.map(c => measure(c, start, end));
    const sleep = amounts.reduce((sum, m) => sum + m[3] / MS.MIN, 0), off = amounts.reduce((sum, m) => sum + m[2] / MS.MIN, 0), edge = amounts.reduce((sum, m) => sum + m[1] / MS.MIN, 0);
    const fairness = options.fairness ? Math.max(...v.people.map(p => (options.priorBurden && Object.hasOwn(options.priorBurden, p.id) ? options.priorBurden[p.id] : 0) + p.burden)) : 0;
    const score = [sleep, off + edge + sleep, off, fairness, Math.abs(start - near), start];
    const reasons = [`${fullWorkCount}/${people.length} within working hours for the full ${durationMin} min`, `${overlapMin.toFixed(1).replace(/\.0$/, '')} min shared working time`, `Sleep ${sleep.toFixed(1)}, off ${off.toFixed(1)}, edge ${edge.toFixed(1)} person-minutes`, ...(options.fairness ? [`Fairness: maximum prior + meeting burden ${fairness.toFixed(2)}`] : []), 'Ranked by sleeping minutes, outside-work minutes, off-hours minutes, optional fairness, distance from selected time, then earlier instant. Based on configured hours, not calendar availability.'];
    all.push({ start, verdict: v, score, reasons, overlapMin, fullWorkCount });
  }
  all.sort((a, b) => compareScores(a.score, b.score));
  const picked: Suggestion[] = [];
  for (const s of all) { if (picked.every(p => Math.abs(p.start - s.start) >= separation * MS.MIN)) picked.push(s); if (picked.length === count) break; }
  return picked;
}
export const STATE_LABEL: Record<DayState, string> = { work: 'Working hours', edge: 'Just outside working hours', off: 'Off hours', sleep: 'Sleeping hours' };
