import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/fonts.css';
import '../../src/styles.css';
import { LongitudeApp } from '../../src/App';
import { InteractiveClock } from '../../src/components/InteractiveClock';
import { TimeReadout } from '../../src/components/TimeReadout';
import { CITIES, cityFromZone } from '../../src/lib/cities';
import { DEFAULT_SETTINGS, StoreProvider, locationFromCity, useStore } from '../../src/state/store';
import type { WorkingHours, SleepHours } from '../../src/lib/schedule';
import { webPlatform } from '../../src/platform';
import { TitleBar } from '../../src/components/WindowChrome';
import { CompactWidget } from '../../src/components/CompactWidget';
import { runSchedulingSearch, type SearchInput } from '../../src/scheduling/search-client';

export interface Options {
  zone?: string; now?: number; selected?: number | null; view?: 'clock' | 'planner' | 'settings';
  mode?: 'full' | 'compact'; theme?: 'dark' | 'light'; step?: 1 | 5; hour12?: boolean;
  reducedMotion?: 'system' | 'on' | 'off'; realtime?: boolean;
  zones?: string[]; work?: WorkingHours; sleep?: SleepHours; durationMin?: number;
  persist?: boolean; storageDelay?: number; failReads?: boolean; failWrites?: boolean; strict?: boolean;
}
const root = createRoot(document.getElementById('root')!);
let sequence = 0;
let lastOptions: Options = {};
const defaultNow = Date.parse('2026-10-20T13:00:00Z');
function initial(options: Options) {
  const zones = [...new Set(options.zones ?? [options.zone ?? 'Asia/Manila', 'America/New_York', 'Europe/London', 'Australia/Sydney'])];
  const locations = zones.map(zone => locationFromCity(CITIES.find(city => city.zone === zone) ?? cityFromZone(zone)));
  for (const location of locations) { if (options.work) location.work = options.work; if (options.sleep) location.sleep = options.sleep; }
  return {
    groups: [{ id: 'test-group', name: 'My Team', locations, referenceId: locations[0].id }], activeGroupId: 'test-group',
    selected: options.selected ?? null, view: options.view ?? 'clock', mode: options.mode ?? 'full',
    meeting: { title: 'Weekly sync', durationMin: options.durationMin ?? 30, weekly: false },
    settings: { ...DEFAULT_SETTINGS, theme: options.theme ?? 'dark', step: options.step ?? 5,
      hour12: options.hour12 ?? true, reducedMotion: options.reducedMotion ?? 'off' },
  };
}
function ClockHarness({ options }: { options: Options }) {
  const { state, dispatch, now } = useStore();
  const zone = options.zone ?? 'Asia/Manila';
  const at = state.selected ?? now;
  const select = (value: number) => dispatch({ type: 'select', at: value });
  const reset = () => dispatch({ type: 'select', at: null });
  return <div className="lg-root flex h-full flex-col items-center justify-center gap-4" data-theme={options.theme ?? 'dark'}>
    <InteractiveClock value={at} now={now} zone={zone} live={state.selected === null} step={options.step ?? 5}
      hour12={options.hour12 ?? true} onChange={select} onReset={reset} reducedMotion={options.reducedMotion === 'on'} className="shrink-0" />
    <TimeReadout value={at} now={now} zone={zone} placeLabel={zone} live={state.selected === null} hour12={options.hour12 ?? true}
      onChange={select} onReset={reset} />
    <output aria-label="Authoritative selected instant">{at}</output>
    <output aria-label="Clock mode">{state.selected === null ? 'live' : 'planning'}</output>
  </div>;
}
window.longitudeTest = {
  mountWidgetChrome(nativeMac = true) {
    root.render(<div data-theme="dark"><CompactWidget title="My Team" locations={[]} referenceZone="UTC" now={defaultNow} value={defaultNow}
      live hour12 pinned opacity={1} chrome="macos" nativeMac={nativeMac} onChange={() => {}} onReset={() => {}} onTogglePin={() => {}}
      onExpand={() => {}} onClose={() => {}} onOpacity={() => {}} /></div>);
  },
  mountChrome(nativeMac = true) {
    root.render(<div className="lg-root" data-theme="dark"><TitleBar chrome="macos" nativeMac={nativeMac} center={<span>Clock</span>}
      onMinimize={() => {}} onMaximize={() => {}} onClose={() => {}} onCompact={() => {}} /></div>);
  },
  mount(options = {}) {
    lastOptions = options;
    const platform = { ...webPlatform, storage: {
      async read(key: Parameters<typeof webPlatform.storage.read>[0]) {
        if (options.storageDelay) await new Promise(r => setTimeout(r, options.storageDelay));
        if (options.failReads) throw new Error('Test read failure'); return webPlatform.storage.read(key);
      },
      async compareAndSwap(...args: Parameters<typeof webPlatform.storage.compareAndSwap>) {
        if (options.failWrites) throw new Error('Test storage full'); return webPlatform.storage.compareAndSwap(...args);
      },
    } };
    const app = <LongitudeApp key={++sequence} initial={initial(options)} platform={platform} persist={options.persist} fixedNow={options.realtime ? undefined : options.now ?? defaultNow} />;
    root.render(options.strict ? <React.StrictMode>{app}</React.StrictMode> : app);
  },
  mountClock(options = {}) {
    root.render(<StoreProvider key={++sequence} initial={initial(options)} fixedNow={options.realtime ? undefined : options.now ?? defaultNow}>
      <ClockHarness options={options} />
    </StoreProvider>);
  },
  search(input: SearchInput) { return runSchedulingSearch(input).promise; },
  storageFailure(reads: boolean, writes: boolean) { lastOptions.failReads = reads; lastOptions.failWrites = writes; },
};
window.longitudeTest.mount({ persist: new URLSearchParams(location.search).has('persist') });
declare global {
  interface Window { longitudeTest: { mountWidgetChrome(nativeMac?: boolean): void; mountChrome(nativeMac?: boolean): void; mount(options?: Options): void; mountClock(options?: Options): void; search(input: SearchInput): Promise<import('../../src/lib/schedule').Suggestion[]>; storageFailure(reads: boolean, writes: boolean): void } }
}
