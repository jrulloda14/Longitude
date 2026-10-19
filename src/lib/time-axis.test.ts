import { describe, expect, it } from 'vitest';
import { civilHourTicks, localDayBounds, localHourCells } from './time-axis';
import { MS, resolveWall, wallTime } from './time';
import { snapInstant, stepInstant } from './time-selection';

describe('absolute geometry shared by timeline and row strip', () => {
  it.each([
    ['Europe/London', '2026-03-29T12:00Z', 23], ['Europe/London', '2026-10-25T12:00Z', 25],
    ['Australia/Lord_Howe', '2026-10-04T00:00Z', 23.5], ['Australia/Lord_Howe', '2026-04-05T00:00Z', 24.5],
    ['America/Sao_Paulo', '2018-11-04T12:00Z', 23], ['Asia/Kathmandu', '2026-10-20T12:00Z', 24],
  ] as const)('%s containing %s covers %s actual hours without gaps', (zone, iso, hours) => {
    const { start, end } = localDayBounds(zone, Date.parse(iso));
    expect((end - start) / MS.HOUR).toBe(hours);
    const cells = localHourCells(zone, start, end);
    expect(cells[0].start).toBe(start);
    expect(cells.at(-1)!.end).toBe(end);
    expect(cells.reduce((sum, c) => sum + c.end - c.start, 0)).toBe(end - start);
    cells.forEach((c, i) => {
      expect(c.end).toBeGreaterThan(c.start);
      if (i) expect(c.start).toBe(cells[i - 1].end);
    });
  });

  it('positions London noon on its civil hour rather than 12 elapsed hours', () => {
    const at = Date.parse('2026-10-25T12:30Z');
    const noon = civilHourTicks('Europe/London', at).find(t => t.hour === 12)!;
    const bounds = localDayBounds('Europe/London', at);
    expect(noon.at).toBe(Date.parse('2026-10-25T12:00Z'));
    expect((noon.at - bounds.start) / (bounds.end - bounds.start)).toBe(13 / 25);
  });

  it('represents both repeated London hours on separate absolute intervals', () => {
    const { start, end } = localDayBounds('Europe/London', Date.parse('2026-10-25T12:00Z'));
    const ones = localHourCells('Europe/London', start, end).filter(c => c.hour === 1);
    expect(ones.map(c => c.start)).toEqual([Date.parse('2026-10-25T00:00Z'), Date.parse('2026-10-25T01:00Z')]);
    expect(ones[1].transition).toBe(true);
  });

  it('splits a Lord Howe spring change at local 02:30', () => {
    const { start, end } = localDayBounds('Australia/Lord_Howe', Date.parse('2026-10-04T00:00Z'));
    const cell = localHourCells('Australia/Lord_Howe', start, end).find(c => c.transition)!;
    expect(cell).toMatchObject({ hour: 2, minute: 30, start: Date.parse('2026-10-03T15:30Z'), end: Date.parse('2026-10-03T16:00Z') });
  });

  it.each(['Asia/Kathmandu', 'Australia/Adelaide', 'Pacific/Chatham'])('keeps %s hour boundaries fractional on a Manila axis', zone => {
    const { start, end } = localDayBounds('Asia/Manila', Date.parse('2026-10-20T12:00Z'));
    const cells = localHourCells(zone, start, end);
    for (const cell of cells.slice(1, -1)) {
      expect(wallTime(zone, cell.start).minute).toBe(0);
      expect(cell.end - cell.start).toBe(MS.HOUR);
    }
    expect(cells[0].end - cells[0].start).toBeLessThan(MS.HOUR);
  });

  it('rejects invalid/unbounded axis intervals', () => {
    expect(() => localHourCells('UTC', 0, 0)).toThrow();
    expect(() => localHourCells('UTC', 0, 4 * MS.DAY)).toThrow();
    expect(() => localHourCells('UTC', NaN, 1000)).toThrow();
  });
});

describe('clock snapping uses local grid without losing chronological folds', () => {
  it.each(['Asia/Kathmandu', 'Australia/Adelaide', 'Pacific/Chatham'])('%s supports five-minute and one-minute precision', zone => {
    const at = resolveWall(zone, 2026, 10, 20, 12, 32).instant + 12_000;
    expect(wallTime(zone, snapInstant(at, 5, zone))).toMatchObject({ hour: 12, minute: 30, second: 0 });
    expect(wallTime(zone, stepInstant(at, 1, 5, zone)).minute).toBe(35);
    expect(wallTime(zone, stepInstant(at, -1, 1, zone)).minute).toBe(32);
  });
  it('moves forward in absolute time across a fold and forward gap', () => {
    expect(stepInstant(Date.parse('2026-10-25T00:55Z'), 1, 5, 'Europe/London')).toBe(Date.parse('2026-10-25T01:00Z'));
    expect(stepInstant(Date.parse('2026-03-29T00:55Z'), 1, 5, 'Europe/London')).toBe(Date.parse('2026-03-29T01:00Z'));
  });
  it('supports historical second-offset grids without rounding the offset', () => {
    expect(wallTime('Europe/Paris', snapInstant(Date.parse('1900-01-01T00:00Z'), 5, 'Europe/Paris'))).toMatchObject({ minute: 10, second: 0 });
  });
  it('validates snap precision and direction', () => {
    expect(() => snapInstant(0, 0)).toThrow();
    expect(() => stepInstant(0, 0 as 1, 5)).toThrow();
  });
});
