/**
 * Solar position — low-precision (±0.1°) almanac formulae, good enough for
 * day / twilight / night shading. Depends only on the instant and the city's
 * coordinates, never on timezone.
 */
import type { Instant } from './time';

const RAD = Math.PI / 180;

/** Sun elevation above the horizon in degrees. */
export function solarElevation(at: Instant, lat: number, lon: number): number {
  const d = at / 86_400_000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  const la = lat * RAD;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / RAD;
}

export type SkyState = 'day' | 'twilight' | 'night';

/** Civil-twilight banding: above 0° day, 0…−6° twilight, below −6° night. */
export function skyState(at: Instant, lat: number, lon: number): SkyState {
  const el = solarElevation(at, lat, lon);
  if (el > -0.833) return 'day';
  if (el > -6) return 'twilight';
  return 'night';
}
