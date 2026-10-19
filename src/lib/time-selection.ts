import { Instant, MS, assertInstant, offsetSeconds } from './time';
import { assertInteger } from './time-validation';

/** Snap the local minute grid while retaining an absolute chronological axis. */
export function snapInstant(at: Instant, minutes: number, zone = 'UTC'): Instant {
  assertInstant(at); assertInteger(minutes, 1, 60, 'Precision');
  const grid = minutes * MS.MIN;
  const offset = offsetSeconds(zone, at) * 1000;
  const result = Math.round((at + offset) / grid) * grid - offset;
  assertInstant(result);
  return result;
}

export function stepInstant(at: Instant, direction: 1 | -1, minutes: number, zone = 'UTC'): Instant {
  assertInstant(at); assertInteger(minutes, 1, 60, 'Precision');
  if (direction !== 1 && direction !== -1) throw new RangeError('Direction must be 1 or -1');
  const grid = minutes * MS.MIN;
  const offset = offsetSeconds(zone, at) * 1000;
  const local = at + offset;
  const result = (direction > 0 ? Math.floor(local / grid) + 1 : Math.ceil(local / grid) - 1) * grid - offset;
  assertInstant(result);
  return result;
}
