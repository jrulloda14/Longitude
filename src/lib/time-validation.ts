import { TimeCache } from './time-cache';

/** Inclusive UTC instant envelope: ISO Gregorian years 0001 through 9999. */
export const MIN_INSTANT = -62_135_596_800_000;
export const MAX_INSTANT = 253_402_300_799_999;
const zoneNames = new TimeCache<string, string>(512);

export function assertInstant(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < MIN_INSTANT || value > MAX_INSTANT) {
    throw new RangeError('Instant must be an integer epoch millisecond in ISO years 0001–9999');
  }
}

export function assertInteger(value: unknown, min: number, max: number, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

/** Canonical spelling/links as reported by the runtime's IANA database. No numeric offset zones. */
export function normalizeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255 || value.trim() !== value || /^[+−-]/.test(value)) {
    throw new RangeError('Timezone must be a valid IANA identifier');
  }
  const cached = zoneNames.get(value);
  if (cached) return cached;
  // Intl rejects unknown identifiers and canonicalizes casing and IANA links.
  // Alias spelling can differ by ICU release (e.g. Kolkata/Calcutta).
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  if (!zone || /^[+-]/.test(zone)) throw new RangeError('Fixed offsets are not IANA timezone identifiers');
  return zoneNames.set(value, zone);
}

export function assertTimeFormat(value: unknown): asserts value is { hour12: boolean } {
  if (!value || typeof value !== 'object' || typeof (value as { hour12?: unknown }).hour12 !== 'boolean') {
    throw new TypeError('Time format requires a boolean hour12');
  }
}

/** Date.UTC treats years 0–99 as 1900–1999; this explicit setter does not. */
export function civilUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
