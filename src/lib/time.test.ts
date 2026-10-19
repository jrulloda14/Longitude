/** Vitest: the cases the handoff guarantees. Run with `npx vitest`. */
import { describe, expect, it } from 'vitest';
import { formatTimeString, nextTransition, offsetMinutes, resolveWall, zoneAbbreviation } from './time';
import { summaryText, buildIcs } from './share';

const f = { hour12: true };
const places = [['Manila', 'Asia/Manila'], ['New York', 'America/New_York'], ['London', 'Europe/London'], ['Sydney', 'Australia/Sydney']].map(([label, zone]) => ({ label, zone }));

describe('time engine', () => {
  const start = resolveWall('Asia/Manila', 2026, 10, 20, 21, 0).instant;
  it('converts across zones with real rules', () => {
    expect(formatTimeString('America/New_York', start, f)).toBe('9:00 AM');
    expect(formatTimeString('Europe/London', start, f)).toBe('2:00 PM');
    expect(formatTimeString('Australia/Sydney', start, f)).toBe('12:00 AM');
  });
  it('builds the summary and ICS', () => {
    const s = { title: 'Meeting', start, durationMin: 30, reference: places[0], places, format: f };
    expect(summaryText(s)).toContain('Sydney — 12:00 AM (next day)');
    expect(buildIcs(s, { now: 0, uid: 'x' })).toContain('DTSTART:20261020T130000Z');
  });
  it('finds DST transitions', () => {
    const from = Date.UTC(2026, 9, 19);
    expect(new Date(nextTransition('Europe/London', from)!.at).toISOString()).toBe('2026-10-25T01:00:00.000Z');
    expect(new Date(nextTransition('America/New_York', from)!.at).toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });
  it('resolves ambiguous and nonexistent wall times', () => {
    const amb = resolveWall('America/New_York', 2026, 11, 1, 1, 30);
    expect(amb.kind).toBe('ambiguous');
    if (amb.kind === 'ambiguous') {
      expect(zoneAbbreviation('America/New_York', amb.alternatives[0])).toBe('EDT');
      expect(zoneAbbreviation('America/New_York', amb.alternatives[1])).toBe('EST');
    }
    const gap = resolveWall('America/New_York', 2027, 3, 14, 2, 30);
    expect(gap.kind).toBe('nonexistent');
  });
  it('handles quarter-hour offsets', () => {
    expect(offsetMinutes('Asia/Kathmandu', Date.UTC(2026, 9, 20))).toBe(345);
  });
});
