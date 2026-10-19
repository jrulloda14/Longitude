import type { AppState, Group, Location, Settings } from '../state/store';
import { DEFAULT_SLEEP, DEFAULT_WORK, type WorkingHours, type SleepHours, validateHours } from '../lib/schedule';
import { normalizeZone } from '../lib/time';

export const SCHEMA_VERSION = 1;
export const MAX_CONFIGURATION_BYTES = 2 * 1024 * 1024;
export type DurableConfiguration = Pick<AppState, 'groups' | 'activeGroupId' | 'settings' | 'meeting' | 'onboarded' | 'coach'>;
export class FutureSchemaError extends Error {}
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null;
const clone = <T>(v: T): T => structuredClone(v);
export function durable(state: AppState): DurableConfiguration {
  return { groups: state.groups, activeGroupId: state.activeGroupId, settings: state.settings, meeting: state.meeting, onboarded: state.onboarded, coach: state.coach };
}
export function decodeConfiguration(raw: string, defaults: DurableConfiguration): { data: DurableConfiguration; revision: number; issues: string[]; migrated: boolean } {
  if (new TextEncoder().encode(raw).length > MAX_CONFIGURATION_BYTES) throw new Error('Saved configuration exceeds 2 MiB.');
  const root = object(JSON.parse(raw)); if (!root) throw new Error('Saved configuration must be an object.');
  const migrated = !Object.hasOwn(root, 'version');
  if (!migrated && typeof root.version === 'number' && root.version > SCHEMA_VERSION) throw new FutureSchemaError('Saved configuration uses a newer schema. Saving is paused to protect it.');
  if (!migrated && root.version !== SCHEMA_VERSION) throw new Error('Invalid saved schema version.');
  const source = migrated ? root : object(root.data); if (!source) throw new Error('Saved configuration data is missing.');
  const issues: string[] = [];
  const warn = (name: string) => { if (issues.length < 100) issues.push(name); };
  const text = (value: unknown, fallback: string, name: string, max = 200) => {
    if (typeof value === 'string' && value.trim().length && value.length <= max) return value;
    if (value !== undefined) warn(name); return fallback;
  };
  const bool = (value: unknown, fallback: boolean, name: string) => {
    if (typeof value === 'boolean') return value; if (value !== undefined) warn(name); return fallback;
  };
  const number = (v: unknown, fallback: number, min: number, max: number, name: string, integer = true): number => {
    if (typeof v === 'number' && Number.isFinite(v) && (!integer || Number.isInteger(v)) && v >= min && v <= max) return v;
    if (v !== undefined) warn(name); return fallback;
  };
  const choice = <T extends string | number>(v: unknown, fallback: T, allowed: readonly T[], name: string): T => {
    if (allowed.includes(v as T)) return v as T; if (v !== undefined) warn(name); return fallback;
  };
  const work = (v: unknown, fallback: WorkingHours, name: string): WorkingHours => {
    if (v === undefined) return clone(fallback);
    const o = object(v); if (!o) { warn(name); return clone(fallback); }
    let days = clone(fallback.days);
    if (Array.isArray(o.days) && o.days.length <= 7 && [...o.days].every(d => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)) {
      days = [...new Set(o.days as number[])]; if (days.length !== o.days.length) warn(`${name} duplicate weekdays`);
    } else if (o.days !== undefined) warn(`${name} weekdays`);
    const pair = (i: Obj) => ({ start: number(i.start, fallback.start, 0, 1439, `${name} start`), end: number(i.end, fallback.end, 0, 1440, `${name} end`) });
    let result: WorkingHours = { ...pair(o), days };
    if (result.start === result.end) { warn(name); result = { ...clone(fallback), days }; }
    if (o.intervals !== undefined) {
      if (!Array.isArray(o.intervals) || !o.intervals.length || o.intervals.length > 8) warn(`${name} intervals`);
      else {
        const intervals = o.intervals.flatMap(item => {
          const row = object(item); if (!row) { warn(`${name} interval`); return []; }
          const i = pair(row); if (i.start === i.end) { warn(`${name} interval`); return []; } return [i];
        });
        if (intervals.length) result = { ...intervals[0], days, intervals };
      }
    }
    validateHours(result, DEFAULT_SLEEP); return result;
  };
  const sleep = (v: unknown): SleepHours => {
    if (v === undefined) return clone(DEFAULT_SLEEP);
    const o = object(v); if (!o) { warn('sleep'); return clone(DEFAULT_SLEEP); }
    return { start: number(o.start, DEFAULT_SLEEP.start, 0, 1439, 'sleep start'), end: number(o.end, DEFAULT_SLEEP.end, 0, 1440, 'sleep end') };
  };
  const unique = (v: unknown, used: Set<string>, fallback: string): string => {
    let id = typeof v === 'string' && /^[\w.-]{1,128}$/.test(v) ? v : fallback;
    if (id !== v || used.has(id)) { warn('invalid or duplicate ID'); id = fallback; }
    while (used.has(id)) id += '-copy'; used.add(id); return id;
  };
  const groupIds = new Set<string>(), locationIds = new Set<string>();
  let groups: Group[];
  if (source.groups === undefined) groups = clone(defaults.groups);
  else if (!Array.isArray(source.groups) || !source.groups.length) { warn('groups'); groups = []; }
  else {
    if (source.groups.length > 32) warn('group limit');
    groups = source.groups.slice(0, 32).flatMap((v, gi) => {
      const g = object(v); if (!g) { warn('group'); return []; }
      const id = unique(g.id, groupIds, `recovered-group-${gi + 1}`);
      const locations: Location[] = [];
      if (!Array.isArray(g.locations)) warn('locations');
      else {
        if (g.locations.length > 32) warn('location limit');
        for (const [li, value] of g.locations.slice(0, 32).entries()) {
          const l = object(value); if (!l) { warn('location'); continue; }
          let zone: string; try { zone = normalizeZone(l.zone); } catch { warn('invalid timezone: location omitted'); continue; }
          const validCoords = typeof l.lat === 'number' && Number.isFinite(l.lat) && l.lat >= -90 && l.lat <= 90 && typeof l.lon === 'number' && Number.isFinite(l.lon) && l.lon >= -180 && l.lon <= 180;
          locations.push({ id: unique(l.id, locationIds, `recovered-location-${gi + 1}-${li + 1}`),
            name: text(l.name, zone.split('/').pop()!.replace(/_/g, ' '), 'location name'), country: text(l.country, 'Custom timezone', 'country'), zone,
            lat: validCoords ? l.lat as number : 0, lon: validCoords ? l.lon as number : 0,
            ...(!validCoords || l.coordsApprox === true ? { coordsApprox: true } : {}),
            ...(typeof l.note === 'string' && l.note.length <= 200 ? { note: l.note } : {}),
            favorite: bool(l.favorite, true, 'favorite'), work: work(l.work, DEFAULT_WORK, 'work'), sleep: sleep(l.sleep) });
          if (!validCoords) warn('coordinates'); if (l.note !== undefined && (typeof l.note !== 'string' || l.note.length > 200)) warn('label');
        }
      }
      const referenceId = locations.some(l => l.id === g.referenceId) ? g.referenceId as string : locations[0]?.id ?? null;
      if (referenceId !== g.referenceId) warn('reference fallback');
      return [{ id, name: text(g.name, 'Recovered group', 'group name'), locations, referenceId }];
    });
  }
  if (!groups.length) groups = [{ id: 'recovered-group-1', name: 'Recovered group', locations: [], referenceId: null }];
  const s = object(source.settings) ?? {}; if (source.settings !== undefined && !object(source.settings)) warn('settings');
  const d = defaults.settings;
  const settings: Settings = {
    hour12: bool(s.hour12, d.hour12, 'hour12'), step: choice(s.step, d.step, [1, 5], 'precision'), theme: choice(s.theme, d.theme, ['system', 'dark', 'light'], 'theme'),
    chrome: choice(s.chrome, d.chrome, ['windows', 'macos'], 'chrome'), reducedMotion: choice(s.reducedMotion, d.reducedMotion, ['system', 'on', 'off'], 'motion'),
    showTimeline: bool(s.showTimeline, d.showTimeline, 'timeline'), defaultWork: work(s.defaultWork, d.defaultWork, 'default work'),
    widgetOpacity: number(s.widgetOpacity, d.widgetOpacity, .6, 1, 'opacity', false), widgetPinned: bool(s.widgetPinned, d.widgetPinned, 'pin'), trayIcon: bool(s.trayIcon, d.trayIcon, 'tray'),
    closeBehavior: choice(s.closeBehavior, d.closeBehavior, ['hide', 'quit'], 'close behavior'),
    globalShortcut: text(s.globalShortcut, d.globalShortcut, 'global shortcut', 100), launchAtSignIn: bool(s.launchAtSignIn, d.launchAtSignIn, 'launch at sign-in'),
  };
  const m = object(source.meeting) ?? {}; if (source.meeting !== undefined && !object(source.meeting)) warn('meeting');
  const activeGroupId = groups.some(g => g.id === source.activeGroupId) ? source.activeGroupId as string : groups[0].id;
  if (source.activeGroupId !== undefined && activeGroupId !== source.activeGroupId) warn('active group fallback');
  const data: DurableConfiguration = { groups, activeGroupId, settings, meeting: { title: text(m.title, defaults.meeting.title, 'meeting title', 500), durationMin: number(m.durationMin, defaults.meeting.durationMin, 1, 1440, 'duration'), weekly: bool(m.weekly, defaults.meeting.weekly, 'weekly') }, onboarded: bool(source.onboarded, defaults.onboarded, 'onboarded'), coach: bool(source.coach, defaults.coach, 'coach') };
  const revision = migrated ? 0 : number(root.revision, 0, 0, Number.MAX_SAFE_INTEGER - 1, 'revision');
  return { data, revision, issues, migrated };
}
export function encodeConfiguration(data: DurableConfiguration, revision: number, defaults = data): string {
  const raw = JSON.stringify({ version: SCHEMA_VERSION, revision, data });
  const decoded = decodeConfiguration(raw, defaults);
  return JSON.stringify({ version: SCHEMA_VERSION, revision, data: decoded.data });
}
