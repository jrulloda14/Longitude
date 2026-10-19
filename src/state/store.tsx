/**
 * App state — one reducer, one context. Owns: groups, locations, reference,
 * the selected instant, view, settings. Components below receive plain props;
 * only container components (App, *Container) read the store.
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CITIES, City, cityById } from '../lib/cities';
import { DEFAULT_SLEEP, DEFAULT_WORK, Participant, SleepHours, WorkingHours } from '../lib/schedule';
import { Instant, systemZone } from '../lib/time';
import { Platform, webPlatform } from '../platform';

export interface Location {
  id: string;
  name: string;
  country: string;
  zone: string;
  lat: number;
  lon: number;
  coordsApprox?: boolean;
  /** optional person/team label, e.g. "Priya" or "Design" */
  note?: string;
  work: WorkingHours;
  sleep: SleepHours;
}

export interface Group {
  id: string;
  name: string;
  locations: Location[];
  referenceId: string | null;
}

export interface Settings {
  hour12: boolean;
  step: 1 | 5;
  theme: 'system' | 'dark' | 'light';
  chrome: 'windows' | 'macos';
  reducedMotion: 'system' | 'on' | 'off';
  showTimeline: boolean;
  defaultWork: WorkingHours;
  widgetOpacity: number; // 0.6–1
  widgetPinned: boolean;
  trayIcon: boolean;
}

export type View = 'clock' | 'planner' | 'settings';
export type Mode = 'full' | 'compact';

export interface AppState {
  groups: Group[];
  activeGroupId: string;
  /** null = live (follows the current time) */
  selected: Instant | null;
  view: View;
  mode: Mode;
  onboarded: boolean;
  /** one-time dial coach mark */
  coach: boolean;
  settings: Settings;
  meeting: { title: string; durationMin: number; weekly: boolean };
}

let idSeq = 0;
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

export function locationFromCity(c: City, work: WorkingHours = DEFAULT_WORK): Location {
  return { id: uid('loc'), name: c.name, country: c.country, zone: c.zone, lat: c.lat, lon: c.lon, coordsApprox: c.coordsApprox, work: { ...work }, sleep: { ...DEFAULT_SLEEP } };
}

const fromIds = (ids: string[]) => ids.map((id) => cityById(id)).filter(Boolean).map((c) => locationFromCity(c!));

function homeCity(): City {
  const z = systemZone();
  return CITIES.find((c) => c.zone === z) ?? CITIES.find((c) => c.id === 'manila')!;
}

export function presetGroups(): Group[] {
  const home = homeCity();
  const mk = (name: string, ids: string[]): Group => {
    const locs = fromIds(ids);
    return { id: uid('grp'), name, locations: locs, referenceId: locs[0]?.id ?? null };
  };
  const team = mk('My Team', Array.from(new Set([home.id, 'manila', 'new-york', 'london', 'sydney'])).slice(0, 4));
  return [
    team,
    mk('US Clients', [home.id, 'new-york', 'chicago', 'denver', 'los-angeles'].filter((v, i, a) => a.indexOf(v) === i)),
    mk('APAC', ['singapore', 'manila', 'mumbai', 'kathmandu', 'tokyo', 'adelaide']),
    mk('Family', [home.id, 'dubai', 'toronto'].filter((v, i, a) => a.indexOf(v) === i)),
  ];
}

export const DEFAULT_SETTINGS: Settings = {
  hour12: true,
  step: 5,
  theme: 'dark',
  chrome: 'windows',
  reducedMotion: 'system',
  showTimeline: true,
  defaultWork: DEFAULT_WORK,
  widgetOpacity: 0.96,
  widgetPinned: true,
  trayIcon: true,
};

export function initialState(overrides: Partial<AppState> = {}): AppState {
  const groups = overrides.groups ?? presetGroups();
  return {
    groups,
    activeGroupId: groups[0].id,
    selected: null,
    view: 'clock',
    mode: 'full',
    onboarded: true,
    coach: false,
    settings: DEFAULT_SETTINGS,
    meeting: { title: 'Weekly sync', durationMin: 30, weekly: false },
    ...overrides,
  };
}

export type Action =
  | { type: 'select'; at: Instant | null }
  | { type: 'view'; view: View }
  | { type: 'mode'; mode: Mode }
  | { type: 'group/switch'; id: string }
  | { type: 'group/create'; name: string; locations?: Location[] }
  | { type: 'group/rename'; id: string; name: string }
  | { type: 'group/duplicate'; id: string }
  | { type: 'group/delete'; id: string }
  | { type: 'loc/add'; location: Location }
  | { type: 'loc/remove'; id: string }
  | { type: 'loc/move'; id: string; to: number }
  | { type: 'loc/update'; id: string; patch: Partial<Location> }
  | { type: 'loc/reference'; id: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'meeting'; patch: Partial<AppState['meeting']> }
  | { type: 'onboard/done'; groups?: Group[] }
  | { type: 'onboard/replay' }
  | { type: 'coach/dismiss' }
  | { type: 'replace'; state: AppState };

function mapActive(s: AppState, f: (g: Group) => Group): AppState {
  return { ...s, groups: s.groups.map((g) => (g.id === s.activeGroupId ? f(g) : g)) };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'select': return { ...s, selected: a.at };
    case 'view': return { ...s, view: a.view };
    case 'mode': return { ...s, mode: a.mode };
    case 'group/switch': return { ...s, activeGroupId: a.id };
    case 'group/create': {
      const locs = a.locations ?? [];
      const g: Group = { id: uid('grp'), name: a.name, locations: locs, referenceId: locs[0]?.id ?? null };
      return { ...s, groups: [...s.groups, g], activeGroupId: g.id };
    }
    case 'group/rename': return { ...s, groups: s.groups.map((g) => (g.id === a.id ? { ...g, name: a.name } : g)) };
    case 'group/duplicate': {
      const src = s.groups.find((g) => g.id === a.id);
      if (!src) return s;
      const locs = src.locations.map((l) => ({ ...l, id: uid('loc') }));
      const refIdx = src.locations.findIndex((l) => l.id === src.referenceId);
      const g: Group = { id: uid('grp'), name: `${src.name} copy`, locations: locs, referenceId: locs[refIdx]?.id ?? locs[0]?.id ?? null };
      return { ...s, groups: [...s.groups, g], activeGroupId: g.id };
    }
    case 'group/delete': {
      if (s.groups.length <= 1) return s;
      const groups = s.groups.filter((g) => g.id !== a.id);
      return { ...s, groups, activeGroupId: s.activeGroupId === a.id ? groups[0].id : s.activeGroupId };
    }
    case 'loc/add':
      return mapActive(s, (g) => ({ ...g, locations: [...g.locations, a.location], referenceId: g.referenceId ?? a.location.id }));
    case 'loc/remove':
      return mapActive(s, (g) => {
        const locations = g.locations.filter((l) => l.id !== a.id);
        return { ...g, locations, referenceId: g.referenceId === a.id ? locations[0]?.id ?? null : g.referenceId };
      });
    case 'loc/move':
      return mapActive(s, (g) => {
        const from = g.locations.findIndex((l) => l.id === a.id);
        if (from < 0) return g;
        const locations = g.locations.slice();
        const [item] = locations.splice(from, 1);
        locations.splice(Math.max(0, Math.min(locations.length, a.to)), 0, item);
        return { ...g, locations };
      });
    case 'loc/update':
      return mapActive(s, (g) => ({ ...g, locations: g.locations.map((l) => (l.id === a.id ? { ...l, ...a.patch } : l)) }));
    case 'loc/reference': return mapActive(s, (g) => ({ ...g, referenceId: a.id }));
    case 'settings': return { ...s, settings: { ...s.settings, ...a.patch } };
    case 'meeting': return { ...s, meeting: { ...s.meeting, ...a.patch } };
    case 'onboard/done': {
      const groups = a.groups ?? s.groups;
      return { ...s, onboarded: true, coach: true, groups, activeGroupId: groups[0].id, selected: null };
    }
    case 'onboard/replay': return { ...s, onboarded: false, view: 'clock' };
    case 'coach/dismiss': return s.coach ? { ...s, coach: false } : s;
    case 'replace': return a.state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  platform: Platform;
  now: Instant;
}
const StoreCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = 'longitude.v1';

export function StoreProvider(props: {
  children: React.ReactNode;
  initial?: Partial<AppState>;
  platform?: Platform;
  /** false in component previews so they don't share one saved state */
  persist?: boolean;
  /** freeze "now" for deterministic previews */
  fixedNow?: Instant;
}) {
  const platform = props.platform ?? webPlatform;
  const persist = props.persist ?? false;
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = persist ? platform.storage.load<AppState>(STORAGE_KEY) : null;
    return saved && saved.groups?.length ? { ...initialState(), ...saved, selected: null, mode: 'full' as Mode } : initialState(props.initial);
  });
  const now = useNow(props.fixedNow);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (persist) platform.storage.save(STORAGE_KEY, { ...state, selected: null });
  }, [state, persist, platform]);
  const value = useMemo(() => ({ state, dispatch, platform, now }), [state, platform, now]);
  return <StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside <StoreProvider>');
  return c;
}

/** Wall-clock "now", re-rendering on each second boundary. */
export function useNow(fixed?: Instant): Instant {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(t);
  }, [fixed]);
  return now;
}

// ── Selectors ──────────────────────────────────────────────────────────────

export function activeGroup(s: AppState): Group {
  return s.groups.find((g) => g.id === s.activeGroupId) ?? s.groups[0];
}
export function referenceOf(g: Group): Location | null {
  return g.locations.find((l) => l.id === g.referenceId) ?? g.locations[0] ?? null;
}
export function toParticipants(locs: Location[]): Participant[] {
  return locs.map((l) => ({ id: l.id, label: l.note ? `${l.name} (${l.note})` : l.name, zone: l.zone, work: l.work, sleep: l.sleep }));
}
