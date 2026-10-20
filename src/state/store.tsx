/**
 * App state — one reducer, one context. Owns: groups, locations, reference,
 * the selected instant, view, settings. Components below receive plain props;
 * only container components (App, *Container) read the store.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CITIES, City, cityById } from '../lib/cities';
import { DEFAULT_SLEEP, DEFAULT_WORK, Participant, SleepHours, WorkingHours } from '../lib/schedule';
import { Instant, systemZone } from '../lib/time';
import { Platform, webPlatform } from '../platform';
import { ConfigurationRepository, type PersistenceStatus } from '../persistence/repository';
import { durable } from '../persistence/schema';
import { NativeStoreProvider } from '../desktop/NativeStoreProvider';

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
  /** Missing in legacy data means favorite, preserving original widget rows. */
  favorite?: boolean;
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
  closeBehavior: 'hide' | 'quit';
  globalShortcut: string;
  launchAtSignIn: boolean;
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
  return { id: uid('loc'), name: c.name, country: c.country, zone: c.zone, lat: c.lat, lon: c.lon, coordsApprox: c.coordsApprox, favorite: true, work: structuredClone(work), sleep: { ...DEFAULT_SLEEP } };
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
  closeBehavior: 'hide',
  globalShortcut: 'Ctrl+Alt+T',
  launchAtSignIn: false,
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
    settings: structuredClone(DEFAULT_SETTINGS),
    meeting: { title: 'Weekly sync', durationMin: 30, weekly: false },
    ...overrides,
  };
}

export type Action =
  | { type: 'select'; at: Instant | null }
  | { type: 'view'; view: View }
  | { type: 'mode'; mode: Mode }
  | { type: 'group/switch'; id: string }
  | { type: 'group/create'; name: string; locations?: Location[]; id?: string }
  | { type: 'group/rename'; id: string; name: string }
  | { type: 'group/duplicate'; id: string; copyId?: string; locationIds?: Record<string, string> }
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
    case 'group/switch': return s.groups.some(g => g.id === a.id) ? { ...s, activeGroupId: a.id } : s;
    case 'group/create': {
      if (s.groups.length >= 32) return s;
      const locs = a.locations ?? [];
      const g: Group = { id: a.id ?? uid('grp'), name: a.name, locations: locs, referenceId: locs[0]?.id ?? null };
      return { ...s, groups: [...s.groups, g], activeGroupId: g.id };
    }
    case 'group/rename': return { ...s, groups: s.groups.map((g) => (g.id === a.id ? { ...g, name: a.name } : g)) };
    case 'group/duplicate': {
      if (s.groups.length >= 32) return s;
      const src = s.groups.find((g) => g.id === a.id);
      if (!src) return s;
      const locs = src.locations.map((l) => ({ ...l, id: a.locationIds?.[l.id] ?? uid('loc') }));
      const refIdx = src.locations.findIndex((l) => l.id === src.referenceId);
      const g: Group = { id: a.copyId ?? uid('grp'), name: `${src.name} copy`, locations: locs, referenceId: locs[refIdx]?.id ?? locs[0]?.id ?? null };
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
    case 'loc/reference': return mapActive(s, (g) => g.locations.some(l => l.id === a.id) ? { ...g, referenceId: a.id } : g);
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

export interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  platform: Platform;
  /**
   * Wall clock for the container: per second while live, minute-aligned while
   * planning, so a fixed selection does not re-render every row each second
   * (M7.1). Displays whose output changes within a minute read <WithNow>.
   */
  now: Instant;
  persistence: PersistenceStatus;
  retryPersistence(): void;
  discardPending?(): void;
}
export const StoreCtx = createContext<Ctx | null>(null);

/** Exact per-second wall clock, for the few displays that show seconds-sensitive "now". */
export const NowCtx = createContext<Instant>(0);
export function WithNow({ children }: { children(now: Instant): React.ReactNode }) {
  return <>{children(useContext(NowCtx))}</>;
}
/** Minute boundaries cover every offset transition, so offset and HH:MM results are unchanged. */
export const containerNow = (now: Instant, live: boolean): Instant => live ? now : Math.floor(now / MS_PER_MINUTE) * MS_PER_MINUTE;
const MS_PER_MINUTE = 60_000;

export function StoreProvider(props: StoreProviderProps) {
  if (props.platform?.desktop) return <NativeStoreProvider {...props} platform={props.platform} />;
  return <BrowserStoreProvider {...props} />;
}
export interface StoreProviderProps {
  children: React.ReactNode;
  initial?: Partial<AppState>;
  platform?: Platform;
  /** false in component previews so they don't share one saved state */
  persist?: boolean;
  /** freeze "now" for deterministic previews */
  fixedNow?: Instant;
}
function BrowserStoreProvider(props: StoreProviderProps) {
  const platform = props.platform ?? webPlatform;
  const persist = props.persist ?? false;
  const [state, rawDispatch] = useReducer(reducer, undefined, () => initialState(props.initial));
  const defaults = useRef(state);
  const [persistence, setPersistence] = useState<PersistenceStatus>({ phase: persist ? 'loading' : 'disabled', message: '' });
  const [hydrated, setHydrated] = useState(!persist);
  const [inMemory, setInMemory] = useState(false);
  const ready = useRef(!persist);
  const queued = useRef<Action[]>([]);
  const repo = useMemo(() => new ConfigurationRepository(platform.storage, durable(defaults.current), setPersistence), [platform]);
  const dispatch = useCallback((action: Action) => {
    if (!ready.current) queued.current.push(action);
    rawDispatch(action);
  }, []);
  const hydrate = useCallback(async (active: () => boolean = () => true) => {
    const data = await repo.load();
    if (!active()) return;
    if (repo.needsReadRetry) { setHydrated(false); return; }
    let next: AppState = { ...defaults.current, ...data, selected: null, mode: 'full', view: 'clock' };
    for (const action of queued.current) next = reducer(next, action);
    queued.current = []; ready.current = true;
    rawDispatch({ type: 'replace', state: next }); setHydrated(true);
  }, [repo]);
  useEffect(() => { let active = true; repo.subscribe(setPersistence); if (persist) void hydrate(() => active); return () => { active = false; repo.close(); }; }, [persist, hydrate, repo]);
  const now = useNow(props.fixedNow);
  useLayoutEffect(() => {
    if (persist && hydrated && !inMemory) repo.update(durable(state));
  }, [state.groups, state.activeGroupId, state.settings, state.meeting, state.onboarded, state.coach, persist, hydrated, inMemory, repo]);
  useEffect(() => {
    if (!persist) return;
    const flush = () => { void repo.flush(); };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [persist, repo]);
  const retryPersistence = useCallback(() => { if (!repo.canSave && persistence.phase === 'error') void hydrate(); else void repo.retry(); }, [repo, persistence.phase, hydrate]);
  const scopedNow = containerNow(now, state.selected === null);
  const value = useMemo(() => ({ state, dispatch, platform, now: scopedNow, persistence, retryPersistence }), [state, dispatch, platform, scopedNow, persistence, retryPersistence]);
  if (persist && !hydrated) return <div className="lg-root flex h-full flex-col items-center justify-center gap-3 p-6" role={persistence.phase === 'error' ? 'alert' : 'status'}>
    {persistence.phase === 'error' ? <><p>{persistence.message}</p><p className="text-caption text-ink-muted">Saved settings have not been replaced. Retry loading, or use temporary settings without saving this session.</p>
      <div className="flex gap-3"><button className="underline" onClick={() => void hydrate()}>Retry</button><button className="underline" onClick={() => { ready.current = true; queued.current = []; setInMemory(true); setHydrated(true); setPersistence({ phase: 'blocked', message: 'Saving is disabled for this session. Existing saved configuration is unchanged.' }); }}>Continue without saving</button></div></> : 'Loading saved configuration…'}
  </div>;
  return <NowCtx.Provider value={now}><StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider></NowCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside <StoreProvider>');
  return c;
}

/** Wall-clock "now", re-rendering on each second boundary. */
export function useNow(fixed?: Instant, pauseWhenHidden = false): Instant {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (pauseWhenHidden && document.hidden) return;
      setNow(Date.now());
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    const visibility = () => { clearTimeout(t); if (!document.hidden) tick(); };
    if (pauseWhenHidden) document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(t); if (pauseWhenHidden) document.removeEventListener('visibilitychange', visibility); };
  }, [fixed, pauseWhenHidden]);
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
