/**
 * Forgiving time-of-day parser for the direct time input.
 * Accepts: "9", "9a", "9:30", "930", "21:30", "9.30pm", "noon", "midnight".
 * Returns minutes after midnight, or null with a reason.
 */
export type ParseResult = { ok: true; minutes: number } | { ok: false; error: string };

export function parseTimeOfDay(input: string, hour12Hint: boolean): ParseResult {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Enter a time, e.g. 14:30 or 2:30 pm' };
  if (s === 'noon') return { ok: true, minutes: 12 * 60 };
  if (s === 'midnight') return { ok: true, minutes: 0 };
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(a|am|p|pm)?$/.exec(s);
  if (!m) return { ok: false, error: 'Not a time — try 14:30 or 2:30 pm' };
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const mer = m[3];
  if (min > 59) return { ok: false, error: 'Minutes must be 00–59' };
  if (mer) {
    if (h < 1 || h > 12) return { ok: false, error: 'With AM/PM, hours run 1–12' };
    h = (h % 12) + (mer.startsWith('p') ? 12 : 0);
  } else if (h > 23) {
    return { ok: false, error: 'Hours must be 0–23' };
  }
  // Without AM/PM, "9" means 09:00. HANDOFF §Edge cases describes the optional
  // "nearest to current selection" inference for 12-hour users.
  void hour12Hint;
  return { ok: true, minutes: h * 60 + min };
}
