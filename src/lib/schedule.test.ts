import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK, DEFAULT_SLEEP, Participant, DayState, SearchOptions, commonWorkingRanges, dayState, evaluate, stateDuring, stateRanges, suggestTimes, validateHours, workSleepConflict } from './schedule';
import { MS, resolveWall, wallTime } from './time';
const at = (s: string) => Date.parse(s);
const person = (patch: Partial<Participant> = {}): Participant => ({ id: 'p', label: 'Person', zone: 'UTC', work: { start: 540, end: 1020, days: [1, 2, 3, 4, 5] }, sleep: { start: 0, end: 0 }, ...patch });
const local = (p: Participant, y: number, m: number, d: number, h: number, min = 0) => resolveWall(p.zone, y, m, d, h, min).instant;
const referenceDates = new Map<string, boolean>();

// Intentionally slow independent wall-minute oracle. No production range/score helpers.
function referenceState(p: Participant, t: number): DayState {
  const w = wallTime(p.zone, t), minute = w.hour * 60 + w.minute;
  const has = (m: number, a: number, b: number) => a < b ? m >= a && m < b : a > b && (m >= a || m < b);
  if (has(minute, p.sleep.start, p.sleep.end)) return 'sleep';
  const shifts: [number, number][] = [];
  for (let offset = -1; offset <= 1; offset++) {
    if (!p.work.days.includes((w.weekday + offset + 7) % 7)) continue;
    const date = new Date(0); date.setUTCFullYear(w.year, w.month - 1, w.day + offset); date.setUTCHours(12, 0, 0, 0);
    const key = `${p.zone}:${date.toISOString()}`;
    if (!referenceDates.has(key)) {
      const projected = wallTime(p.zone, resolveWall(p.zone, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 12, 0).instant);
      referenceDates.set(key, projected.year === date.getUTCFullYear() && projected.month === date.getUTCMonth() + 1 && projected.day === date.getUTCDate());
    }
    if (!referenceDates.get(key)) continue;
    for (const i of p.work.intervals ?? [p.work]) shifts.push([i.start + offset * 1440, i.end + offset * 1440 + (i.end < i.start ? 1440 : 0)]);
  }
  if (shifts.some(([a, b]) => minute >= a && minute < b)) return 'work';
  if (shifts.some(([a, b]) => minute >= a - 60 && minute < a || minute >= b && minute < b + 60)) return 'edge';
  return 'off';
}
const rank: DayState[] = ['work', 'edge', 'off', 'sleep'];
function referenceDuring(p: Participant, t: number, minutes: number) {
  const samples = Array.from({ length: minutes }, (_, k) => referenceState(p, t + k * MS.MIN));
  return rank[Math.max(...samples.map(s => rank.indexOf(s)))];
}

describe('permanent audit regressions', () => {
  const night = person({ work: { start: 1320, end: 360, days: [5] } });
  it('Friday overnight includes Saturday 02:00', () => expect(dayState(night, at('2026-10-24T02:00Z'))).toBe('work'));
  it('Friday 02:00 is not attributed to Friday evening', () => expect(dayState(night, at('2026-10-23T02:00Z'))).toBe('off'));
  it('a final unsampled minute outside work prevents a good verdict', () => {
    const p = person();
    expect(stateDuring(p, at('2026-10-20T16:50Z'), 14)).toBe('edge');
    expect(evaluate([p], at('2026-10-20T16:50Z'), 14).level).not.toBe('good');
  });
  it('detects one millisecond crossing the end; exact end is excluded', () => {
    expect(stateDuring(person(), at('2026-10-20T16:59Z'), 1)).toBe('work');
    expect(stateDuring(person(), at('2026-10-20T16:59Z') + 1, 1)).toBe('edge');
  });
  it('a short sleep interval between 15-minute samples is detected', () => {
    const p = person({ sleep: { start: 607, end: 608 } });
    expect(stateDuring(p, at('2026-10-20T10:00Z'), 15)).toBe('sleep');
    expect(evaluate([p], at('2026-10-20T10:00Z'), 15).people[0].sleepingMin).toBe(1);
  });
  it('common ranges are exact, clipped and end at non-grid boundaries', () => {
    const p = person({ work: { start: 547, end: 1003, days: [2] } });
    expect(commonWorkingRanges([p], at('2026-10-20T09:00Z'), at('2026-10-20T18:00Z'))).toEqual([{ start: at('2026-10-20T09:07Z'), end: at('2026-10-20T16:43Z') }]);
  });
});

describe('calendar and DST interval semantics', () => {
  it('multiple intervals preserve lunch gap and union overlapping shifts', () => {
    const p = person({ work: { ...DEFAULT_WORK, intervals: [{ start: 540, end: 720 }, { start: 780, end: 1020 }, { start: 840, end: 960 }] } });
    expect(stateDuring(p, at('2026-10-20T11:30Z'), 120)).toBe('edge');
    expect(commonWorkingRanges([p], at('2026-10-20T00:00Z'), at('2026-10-21T00:00Z'))).toEqual([{ start: at('2026-10-20T09:00Z'), end: at('2026-10-20T12:00Z') }, { start: at('2026-10-20T13:00Z'), end: at('2026-10-20T17:00Z') }]);
  });
  it('Sun–Thu overnight retains Friday morning and excludes Sunday morning', () => {
    const p = person({ work: { start: 1200, end: 360, days: [0, 1, 2, 3, 4] } });
    expect(dayState(p, at('2026-10-23T04:00Z'))).toBe('work');
    expect(dayState(p, at('2026-10-25T04:00Z'))).toBe('off');
  });
  it('empty weekdays disable work without disabling sleep', () => {
    const p = person({ work: { ...DEFAULT_WORK, days: [] }, sleep: DEFAULT_SLEEP });
    expect(dayState(p, at('2026-10-20T12:00Z'))).toBe('off');
    expect(dayState(p, at('2026-10-20T03:00Z'))).toBe('sleep');
  });
  it('sleep takes precedence over overlapping work', () => {
    const p = person({ sleep: { start: 600, end: 660 } });
    expect(stateDuring(p, at('2026-10-20T09:30Z'), 120)).toBe('sleep');
    expect(evaluate([p], at('2026-10-20T09:30Z'), 120).people[0].workingMin).toBe(60);
  });
  it('NY fold interval 01:15–01:45 occurs twice with an off-work gap', () => {
    const p = person({ zone: 'America/New_York', work: { start: 75, end: 105, days: [0] } });
    expect(commonWorkingRanges([p], at('2026-11-01T04:00Z'), at('2026-11-01T08:00Z'))).toEqual([
      { start: at('2026-11-01T05:15Z'), end: at('2026-11-01T05:45Z') }, { start: at('2026-11-01T06:15Z'), end: at('2026-11-01T06:45Z') },
    ]);
    expect(stateDuring(p, at('2026-11-01T05:30Z'), 60)).not.toBe('work');
  });
  it('NY nonexistent-only shift has no working interval', () => {
    const p = person({ zone: 'America/New_York', work: { start: 135, end: 165, days: [0] } });
    expect(commonWorkingRanges([p], at('2026-03-08T05:00Z'), at('2026-03-09T04:00Z'))).toEqual([]);
  });
  it.each([
    ['America/New_York', '2026-03-08T05:00Z', '2026-03-09T04:00Z', 23],
    ['America/New_York', '2026-11-01T04:00Z', '2026-11-02T05:00Z', 25],
    ['Australia/Lord_Howe', '2026-10-03T13:30Z', '2026-10-04T13:00Z', 23.5],
    ['Australia/Lord_Howe', '2026-04-04T13:00Z', '2026-04-05T13:30Z', 24.5],
  ] as const)('%s full local day has %s to %s, %s actual hours', (zone, from, to, hours) => {
    const p = person({ zone, work: { start: 0, end: 1440, days: [0, 1, 2, 3, 4, 5, 6] } });
    const ranges = commonWorkingRanges([p], at(from), at(to));
    expect(ranges).toEqual([{ start: at(from), end: at(to) }]);
    expect((ranges[0].end - ranges[0].start) / MS.HOUR).toBe(hours);
  });
  it('Apia skipped Friday does not manufacture a Friday overnight tail', () => {
    const p = person({ zone: 'Pacific/Apia', work: { start: 1320, end: 360, days: [5] } });
    expect(dayState(p, local(p, 2011, 12, 31, 2))).toBe('off');
    expect(commonWorkingRanges([p], at('2011-12-29T10:00Z'), at('2011-12-31T10:00Z'))).toEqual([]);
  });
  it('historical second offset boundaries are not rounded to minutes', () => {
    const p = person({ zone: 'Europe/Paris', work: { start: 540, end: 600, days: [1] } });
    const r = commonWorkingRanges([p], at('1900-01-01T00:00Z'), at('1900-01-02T00:00Z'));
    expect(r[0].start).toBe(at('1900-01-01T08:50:39Z'));
  });
});

describe('independent reference comparisons', () => {
  const cases = [
    ['UTC', '2026-10-23'], ['America/New_York', '2026-03-08'], ['America/New_York', '2026-11-01'],
    ['Europe/London', '2026-10-25'], ['Australia/Lord_Howe', '2026-10-04'], ['Australia/Lord_Howe', '2026-04-05'],
    ['Asia/Kathmandu', '2026-10-23'], ['Pacific/Chatham', '2026-09-27'], ['Australia/Adelaide', '2026-10-04'], ['Pacific/Apia', '2011-12-30'],
  ];
  for (const [zone, date] of cases) it(`${zone} ${date} matches every wall-minute plus full-duration oracle`, () => {
    const p = person({ zone, work: { start: 1320, end: 360, days: [0, 1, 4, 5], intervals: [{ start: 1320, end: 360 }, { start: 577, end: 733 }, { start: 795, end: 1071 }] }, sleep: { start: 61, end: 137 } });
    const from = at(`${date}T00:00Z`), to = from + MS.DAY, ranges = stateRanges(p, from, to);
    let j = 0;
    for (let t = from; t < to; t += MS.MIN) {
      while (t >= ranges[j].end) j++;
      expect(ranges[j].state).toBe(referenceState(p, t));
      expect(dayState(p, t)).toBe(referenceState(p, t));
    }
    for (let k = 0; k < 24; k++) expect(stateDuring(p, from + k * MS.HOUR, 47)).toBe(referenceDuring(p, from + k * MS.HOUR, 47));
  });
  it('recommendation order and full-duration filters match brute-force scoring', () => {
    const people = [person(), person({ id: 'q', zone: 'Asia/Kathmandu', sleep: DEFAULT_SLEEP })];
    const from = at('2026-10-20T00:00Z'), to = from + MS.DAY, near = from + 12 * MS.HOUR, duration = 47;
    const expected = [];
    for (let start = from; start + duration * MS.MIN <= to; start += 30 * MS.MIN) {
      const states = people.map(p => Array.from({ length: duration }, (_, k) => referenceState(p, start + k * MS.MIN)));
      const sleep = states.flat().filter(s => s === 'sleep').length, off = states.flat().filter(s => s === 'off').length, edge = states.flat().filter(s => s === 'edge').length;
      expected.push({ start, score: [sleep, off + edge + sleep, off, 0, Math.abs(start - near), start] });
    }
    expected.sort((a, b) => { for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i]; return 0; });
    expect(suggestTimes(people, from, to, duration, near, 50, 30, { separationMin: 0 }).map(s => ({ start: s.start, score: s.score }))).toEqual(expected);
  });
});

describe('bounded configurable deterministic search', () => {
  const from = at('2026-10-20T00:00Z'), to = from + MS.DAY;
  it('participant subsets exclude unselected calendars; empty subset yields no fabricated results', () => {
    const people = [person(), person({ id: 'q', work: { ...DEFAULT_WORK, days: [] } })];
    const suggestions = suggestTimes(people, from, to, 60, from, 3, 30, { participantIds: ['p'], minParticipants: 1 });
    expect(suggestions.length).toBeGreaterThan(0); expect(suggestions.every(s => s.verdict.people.length === 1 && s.fullWorkCount === 1)).toBe(true);
    expect(suggestTimes(people, from, to, 60, from, 3, 30, { participantIds: [] })).toEqual([]);
  });
  it('minimum shared minutes and full participants are enforced over the whole meeting', () => {
    const p = person();
    expect(suggestTimes([p], at('2026-10-20T16:50Z'), at('2026-10-20T17:30Z'), 30, from, 3, 5, { minParticipants: 1 })).toEqual([]);
    const r = suggestTimes([p], at('2026-10-20T16:50Z'), at('2026-10-20T17:30Z'), 30, from, 3, 5, { minOverlapMin: 10 });
    expect(r).toHaveLength(1); expect(r[0].overlapMin).toBe(10);
  });
  it('preferred overnight windows apply to the whole interval in their own zone', () => {
    const r = suggestTimes([person()], from, to, 60, from, 50, 30, { preferred: { zone: 'Asia/Kathmandu', start: 1320, end: 120 }, separationMin: 0 });
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) for (let i = 0; i < 60; i++) { const w = wallTime('Asia/Kathmandu', s.start + i * MS.MIN); expect(w.hour >= 22 || w.hour < 2).toBe(true); }
  });
  it('tie breaks use earlier instant and are stable under participant reordering', () => {
    const people = [person(), person({ id: 'q' })], near = at('2026-10-20T12:15Z');
    const a = suggestTimes(people, from, to, 30, near, 3, 30, { separationMin: 0 });
    expect(a[0].start).toBe(at('2026-10-20T12:00Z'));
    expect(suggestTimes([...people].reverse(), from, to, 30, near, 3, 30, { separationMin: 0 }).map(s => s.score)).toEqual(a.map(s => s.score));
    expect(a[0].reasons.join(' ')).toContain('not calendar availability');
  });
  it('fairness uses explicit prior burden to break equal aggregate inconvenience', () => {
    const people = [person({ work: { start: 540, end: 600, days: [2] } }), person({ id: 'q', work: { start: 660, end: 720, days: [2] } })];
    const a = at('2026-10-20T09:00Z'), b = at('2026-10-20T12:00Z');
    const r = suggestTimes(people, a, b, 60, a, 10, 120, { separationMin: 0, fairness: true, priorBurden: { p: 10, q: 0 } });
    expect(r[0].start).toBe(a); // keep already-burdened p in work
    expect(r[0].reasons.some(reason => reason.startsWith('Fairness:'))).toBe(true);
    const balanced = suggestTimes(people, a, b, 60, a, 10, 120, { separationMin: 0, fairness: true, priorBurden: { p: 0, q: 10 } });
    expect(balanced[0].start).toBe(at('2026-10-20T11:00Z'));
  });
  it('inherited object keys do not become prior fairness burden', () => {
    const r = suggestTimes([person({ id: 'constructor' })], from, to, 30, from, 3, 30, { fairness: true, priorBurden: {} });
    expect(r.every(s => s.score.every(Number.isFinite))).toBe(true);
  });
  it('conflicting sleep/work is detectable, and disabled days/sleep are not conflicts', () => {
    expect(workSleepConflict(DEFAULT_WORK, { start: 600, end: 660 })).toBe(true);
    expect(workSleepConflict({ ...DEFAULT_WORK, days: [] }, { start: 600, end: 660 })).toBe(false);
    expect(workSleepConflict(DEFAULT_WORK, { start: 0, end: 0 })).toBe(false);
  });
  it('short ranges return no result; full durations stay inside search bounds', () => {
    expect(suggestTimes([person()], from, from + 20 * MS.MIN, 30, from)).toEqual([]);
    expect(suggestTimes([], from, to, 30, from)).toEqual([]);
    for (const s of suggestTimes([person()], from, to, 1440, from)) expect(s.start + 1440 * MS.MIN).toBeLessThanOrEqual(to);
  });
  it('returned range objects cannot poison cached results', () => {
    const p = person(); const ranges = stateRanges(p, from, to); ranges[0].state = 'work';
    expect(stateRanges(p, from, to)[0].state).not.toBe('work');
    p.work.start = 600; expect(commonWorkingRanges([p], from, to)[0].start).toBe(from + 600 * MS.MIN);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1441])('rejects invalid duration %s', n => expect(() => evaluate([person()], from, n)).toThrow());
  it.each([0, -1, NaN, 0.5])('rejects invalid search step %s', n => expect(() => suggestTimes([person()], from, to, 30, from, 3, n)).toThrow());
  it.each([
    () => suggestTimes([person()], from, from + 32 * MS.DAY, 30, from),
    () => suggestTimes([person()], from, from + 31 * MS.DAY, 1, from, 3, 1),
    () => suggestTimes([person()], from, to, 30, from, 0),
    () => suggestTimes([person(), person()], from, to, 30, from),
    () => suggestTimes(Array.from({ length: 33 }, (_, n) => person({ id: String(n) })), from, to, 30, from),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { participantIds: ['missing'] }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { participantIds: ['p', 'p'] }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { participantIds: Array(1) }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { minParticipants: 2 }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { minOverlapMin: 31 }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { preferred: { zone: 'UTC', start: 1, end: 1 } }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { priorBurden: { p: Infinity } }),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { fairness: 'yes' as unknown as boolean }),
    () => commonWorkingRanges([person()], to, from),
    () => evaluate([person({ zone: 'not/a-zone' })], from, 30),
    () => validateHours({ ...DEFAULT_WORK, days: [1, 1] }, DEFAULT_SLEEP),
    () => validateHours({ ...DEFAULT_WORK, start: -1 }, DEFAULT_SLEEP),
    () => validateHours({ ...DEFAULT_WORK, intervals: [] }, DEFAULT_SLEEP),
    () => validateHours({ ...DEFAULT_WORK, intervals: Array(9).fill({ start: 1, end: 2 }) }, DEFAULT_SLEEP),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { minParticipants: null } as unknown as SearchOptions),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { minOverlapMin: null } as unknown as SearchOptions),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { separationMin: null } as unknown as SearchOptions),
    () => suggestTimes([person()], from, to, 30, from, 3, 30, { preferred: null } as unknown as SearchOptions),
    () => validateHours({ ...DEFAULT_WORK, days: Array(1) }, DEFAULT_SLEEP),
    () => validateHours({ ...DEFAULT_WORK, intervals: Array(1) }, DEFAULT_SLEEP),
  ])('rejects invalid/bound-exceeding request %#', check => expect(check).toThrow());
});
