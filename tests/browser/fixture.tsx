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

export interface Options {
  zone?: string; now?: number; selected?: number | null; view?: 'clock' | 'planner' | 'settings';
  mode?: 'full' | 'compact'; theme?: 'dark' | 'light'; step?: 1 | 5; hour12?: boolean;
  reducedMotion?: 'system' | 'on' | 'off'; realtime?: boolean;
  zones?: string[]; work?: WorkingHours; sleep?: SleepHours; durationMin?: number;
}
const root = createRoot(document.getElementById('root')!);
let sequence = 0;
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
  mount(options = {}) {
    root.render(<LongitudeApp key={++sequence} initial={initial(options)} fixedNow={options.realtime ? undefined : options.now ?? defaultNow} />);
  },
  mountClock(options = {}) {
    root.render(<StoreProvider key={++sequence} initial={initial(options)} fixedNow={options.realtime ? undefined : options.now ?? defaultNow}>
      <ClockHarness options={options} />
    </StoreProvider>);
  },
};
window.longitudeTest.mount();
declare global {
  interface Window { longitudeTest: { mount(options?: Options): void; mountClock(options?: Options): void } }
}
