/**
 * App — container. Reads the store, derives everything once per render,
 * and passes plain props down. Views: Clock · Planner · Settings, plus the
 * Compact widget mode and modal layers (search, share, onboarding).
 */
import { CalendarRange, GanttChart, Plus, Share2, Sparkles } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { City } from './lib/cities';
import { commonWorkingRanges, evaluate } from './lib/schedule';
import { useSchedulingSearch } from './scheduling/use-search';
import { SummaryInput, RecurrenceBasis, createExportSession } from './lib/share';
import { Instant, MS, dayNumber, formatTimeString, systemZone } from './lib/time';
import { localDayBounds } from './lib/time-axis';
import { Button, Dialog, IconButton, Segmented, cx } from './primitives';
import {
  AppState, Group, Location, StoreProvider, activeGroup, locationFromCity, referenceOf, toParticipants, uid, useStore,
} from './state/store';
import { Platform } from './platform';
import { CompactWidget } from './components/CompactWidget';
import { DstNotice, describeTransition } from './components/DstNotice';
import { InteractiveClock } from './components/InteractiveClock';
import { LevelGlyph, MeetingOverlapIndicator } from './components/MeetingOverlapIndicator';
import { MeetingSummary } from './components/MeetingSummary';
import { EmptyState, Onboarding, presetCities } from './components/Onboarding';
import { SettingsPanel } from './components/SettingsPanel';
import { TimeReadout } from './components/TimeReadout';
import { TimezoneGroupSelector } from './components/TimezoneGroupSelector';
import { TimezoneList } from './components/TimezoneList';
import { TimezoneSearch } from './components/TimezoneSearch';
import { TimezoneTimeline } from './components/TimezoneTimeline';
import { TitleBar } from './components/WindowChrome';
import { PlannerSearchControls, SearchRequest } from './components/PlannerSearchControls';

function useElementWidth<T extends HTMLElement>(mode: string): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(850);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [mode]);
  return [ref, w];
}

function useResolvedTheme(pref: 'system' | 'dark' | 'light'): 'dark' | 'light' {
  const get = () => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const [sys, setSys] = useState<'dark' | 'light'>(get);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-color-scheme: light)');
    const f = () => setSys(get());
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return pref === 'system' ? sys : pref;
}

export interface LongitudeAppProps {
  initial?: Partial<AppState>;
  platform?: Platform;
  persist?: boolean;
  fixedNow?: Instant;
  /** open a layer immediately — used by design-system previews */
  openLayer?: 'search' | 'share' | null;
}

/** Self-contained app: provider + shell. Fills its parent. */
export function LongitudeApp(props: LongitudeAppProps) {
  return (
    <StoreProvider initial={props.initial} platform={props.platform} persist={props.persist} fixedNow={props.fixedNow}>
      <Shell openLayer={props.openLayer ?? null} />
    </StoreProvider>
  );
}

function Shell({ openLayer }: { openLayer: 'search' | 'share' | null }) {
  const { state, dispatch, platform, now, persistence, retryPersistence, discardPending } = useStore();
  const s = state.settings;
  const theme = useResolvedTheme(s.theme);
  const group = activeGroup(state);
  const ref = referenceOf(group);
  const refZone = ref?.zone ?? systemZone();
  const refLabel = ref?.name ?? refZone.split('/').pop()!.replace(/_/g, ' ');
  const live = state.selected === null;
  const at = state.selected ?? now;
  const fmt = useMemo(() => ({ hour12: s.hour12 }), [s.hour12]);
  const [rootRef, width] = useElementWidth<HTMLDivElement>(state.mode);
  const [layer, setLayer] = useState<null | 'search' | 'share'>(openLayer);
  const [recurrenceBasis, setRecurrenceBasis] = useState<RecurrenceBasis>('utc');
  const [exportSession, setExportSession] = useState(createExportSession);
  const [toast, setToast] = useState<string | null>(null);
  const [draggingDial, setDraggingDial] = useState(false);
  const [dismissedStorageMessage, setDismissedStorageMessage] = useState('');
  const storageNotice = persistence.message && dismissedStorageMessage !== persistence.message ? <div role={persistence.phase === 'error' || persistence.phase === 'blocked' ? 'alert' : 'status'} className="absolute bottom-3 left-3 right-3 z-50 rounded-md border border-line bg-surface p-3 text-caption text-ink shadow-pop">
    {persistence.message} {persistence.phase === 'error' && <button className="ml-2 underline" onClick={retryPersistence}>Retry</button>}
    {persistence.phase === 'error' && discardPending && <button className="ml-2 underline" onClick={discardPending}>Discard pending changes</button>}
    <button aria-label="Dismiss storage message" className="ml-2 underline" onClick={() => setDismissedStorageMessage(persistence.message)}>Dismiss</button>
  </div> : null;
  const reduced = s.reducedMotion === 'on' || (s.reducedMotion === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const chrome = platform.kind === 'tauri' ? (platform.os === 'macos' ? 'macos' : 'windows') : s.chrome;
  useEffect(() => {
    if (platform.desktop?.label !== 'widget') return;
    const element = rootRef.current?.querySelector('[aria-label$="— compact clock"]');
    if (!element) return;
    const observer = new ResizeObserver(() => { void platform.desktop!.control(`widget-height:${Math.ceil(element.getBoundingClientRect().height)}`).catch(error => setToast(String(error))); });
    observer.observe(element); return () => observer.disconnect();
  }, [platform, state.mode]);

  const select = useCallback((t: Instant | null) => {
    dispatch({ type: 'select', at: t });
    dispatch({ type: 'coach/dismiss' });
  }, [dispatch]);
  const reset = useCallback(() => dispatch({ type: 'select', at: null }), [dispatch]);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1600); };
  const copy = async (text: string) => { const ok = await platform.copyText(text); notify(ok ? 'Copied to clipboard' : 'Couldn’t copy'); return ok; };

  const addCity = (c: City) => {
    if (group.locations.length >= 32) { notify('A group supports up to 32 locations.'); return; }
    dispatch({ type: 'loc/add', location: locationFromCity(c, s.defaultWork) });
    notify(`Added ${c.name}`);
  };

  // Global shortcuts
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setLayer('search'); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); dispatch({ type: 'mode', mode: state.mode === 'full' ? 'compact' : 'full' }); }
      else if (mod && e.key === ',') { e.preventDefault(); dispatch({ type: 'view', view: 'settings' }); }
      else if (mod && /^[1-9]$/.test(e.key)) { const g = state.groups[+e.key - 1]; if (g) { e.preventDefault(); dispatch({ type: 'group/switch', id: g.id }); } }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); setLayer('share'); }
      else if (!typing && e.key === 'Home') { reset(); }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [state.mode, state.groups, dispatch, reset, rootRef]);

  useEffect(() => { platform.window.setMode(state.mode); platform.window.setAlwaysOnTop(state.mode === 'compact' && s.widgetPinned); }, [state.mode, s.widgetPinned, platform]);

  const people = useMemo(() => toParticipants(group.locations), [group.locations]);
  const civilDay = dayNumber(refZone, at);
  const day = useMemo(() => localDayBounds(refZone, at), [refZone, civilDay]);
  const overlap = useMemo(() => commonWorkingRanges(people, day.start, day.end), [people, day]);
  const verdict = useMemo(() => evaluate(people, at, state.meeting.durationMin), [people, at, state.meeting.durationMin]);
  const times = useMemo(() => Object.fromEntries(group.locations.map((l) => [l.id, formatTimeString(l.zone, at, fmt)])), [group.locations, at, fmt]);

  const summary: SummaryInput = useMemo(() => ({
    title: state.meeting.title,
    start: at,
    durationMin: state.meeting.durationMin,
    reference: { label: refLabel, zone: refZone },
    places: group.locations.map((l) => ({ label: l.note ? `${l.note} (${l.name})` : l.name, zone: l.zone, work: l.work, sleep: l.sleep })),
    format: fmt,
  }), [state.meeting.title, state.meeting.durationMin, at, refLabel, refZone, group.locations, fmt]);

  const rootClass = cx('lg-root relative flex h-full w-full flex-col overflow-hidden', reduced && 'lg-reduced', s.reducedMotion === 'off' && 'lg-motion-on');

  // ── Compact mode ──
  if (state.mode === 'compact') {
    return (
      <div ref={rootRef} data-theme={theme} className={cx('lg-root relative flex h-full w-full', platform.kind === 'web-prototype' ? 'items-start justify-end p-4' : 'items-start justify-center')}
        style={{ background: platform.kind === 'web-prototype' ? 'radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0) 0 0 / 16px 16px, var(--ground)' : 'transparent' }}>
        {platform.kind === 'web-prototype' && (
          <p className="absolute bottom-4 left-4 max-w-[260px] text-caption text-ink-faint">Prototype backdrop. In the desktop build this is its own 264 px always-on-top window; the main window hides.</p>
        )}
        <CompactWidget
          title={group.name}
          locations={group.locations.filter(l => l.favorite !== false)}
          referenceZone={refZone}
          now={now}
          value={at}
          live={live}
          onChange={select}
          onReset={reset}
          hour12={s.hour12}
          pinned={s.widgetPinned}
          opacity={s.widgetOpacity}
          chrome={chrome}
          nativeMac={platform.kind === 'tauri' && platform.os === 'macos'}
          onTogglePin={() => dispatch({ type: 'settings', patch: { widgetPinned: !s.widgetPinned } })}
          onExpand={() => dispatch({ type: 'mode', mode: 'full' })}
          onClose={() => { if (platform.desktop) void platform.desktop.control('hide-widget').catch(error => notify(String(error))); else dispatch({ type: 'mode', mode: 'full' }); }}
          onOpacity={(v) => dispatch({ type: 'settings', patch: { widgetOpacity: v } })}
        />
        {storageNotice}
      </div>
    );
  }

  const narrow = width < 700;
  const stacked = width < 540;
  const dialSize = stacked ? 200 : narrow ? 236 : 276;
  const coords = ref && !ref.coordsApprox ? { lat: ref.lat, lon: ref.lon } : undefined;

  const groupSelector = (
    <TimezoneGroupSelector
      groups={state.groups.map((g) => ({ id: g.id, name: g.name, count: g.locations.length }))}
      activeId={group.id}
      onSwitch={(id) => dispatch({ type: 'group/switch', id })}
      onCreate={(name) => dispatch({ type: 'group/create', name })}
      onRename={(id, name) => dispatch({ type: 'group/rename', id, name })}
      onDuplicate={(id) => dispatch({ type: 'group/duplicate', id })}
      onDelete={(id) => dispatch({ type: 'group/delete', id })}
    />
  );

  const dial = (size: number) => (
    <div className="relative">
      <InteractiveClock
        value={at} now={now} zone={refZone} coords={coords} live={live} step={s.step} hour12={s.hour12} size={size} reducedMotion={reduced}
        onChange={(v) => select(v)} onReset={reset} onDragChange={setDraggingDial}
      />
      {state.coach && (
        <div role="status" className="lg-pop-in pointer-events-none absolute -bottom-2 left-1/2 w-max -translate-x-1/2 translate-y-full rounded-md bg-surface px-2.5 py-1.5 text-caption text-ink shadow-pop">
          Drag a hand, scroll, or use arrow keys · double-click for now
        </div>
      )}
    </div>
  );

  const dstNotes = group.locations.map((l) => describeTransition(l.zone, l.name, at, fmt, 14)).filter(Boolean) as string[];

  return (
    <div ref={rootRef} data-theme={theme} className={rootClass}>
      <TitleBar
        chrome={chrome}
        nativeMac={platform.kind === 'tauri' && platform.os === 'macos'}
        centerInline={width < 720}
        center={
          <Segmented label="View" value={state.view} onChange={(v) => dispatch({ type: 'view', view: v })}
            options={[{ value: 'clock', label: 'Clock' }, { value: 'planner', label: 'Planner' }, { value: 'settings', label: 'Settings' }]} />
        }
        onMinimize={platform.window.minimize}
        onMaximize={platform.window.toggleMaximize}
        onClose={platform.window.close}
        onCompact={() => dispatch({ type: 'mode', mode: 'compact' })}
      />

      {state.view === 'clock' && (
        <main className={cx('flex min-h-0 flex-1', stacked && 'flex-col overflow-auto')}>
          <section aria-label="Clock" className={cx('flex shrink-0 flex-col items-center justify-center gap-4 px-6', stacked ? 'border-b border-line py-5' : 'border-r border-line', narrow ? 'w-[268px] px-3' : 'w-[340px]', stacked && 'w-full')}>
            {dial(dialSize)}
            <div className={cx(state.coach && 'mt-6')}>
              <TimeReadout value={at} now={now} zone={refZone} placeLabel={refLabel} live={live} hour12={s.hour12} onChange={(v) => select(v)} onReset={reset} compact={narrow} />
            </div>
          </section>

          <section aria-label="Comparison" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-1 px-3">
              {groupSelector}
              <div className="ml-auto flex items-center gap-0.5">
                <IconButton label="Timeline" active={s.showTimeline} onClick={() => dispatch({ type: 'settings', patch: { showTimeline: !s.showTimeline } })}><GanttChart size={15} /></IconButton>
                <IconButton label="Add location" shortcut="Ctrl+K" onClick={() => setLayer('search')}><Plus size={16} /></IconButton>
              </div>
            </div>

            {group.locations.length === 0 ? (
              <EmptyState onAdd={() => setLayer('search')} onQuickAdd={addCity} now={now} hour12={s.hour12} />
            ) : (
              <div className={cx('lg-scroll min-h-0 flex-1 px-2 transition-opacity', draggingDial && 'opacity-100')}>
                <TimezoneList
                  locations={group.locations} at={at} referenceId={group.referenceId} format={fmt} containerRef={rootRef} dense={width < 760 && !stacked}
                  onReorder={(id, to) => dispatch({ type: 'loc/move', id, to })}
                  onSetReference={(id) => dispatch({ type: 'loc/reference', id })}
                  onRemove={(id) => dispatch({ type: 'loc/remove', id })}
                  onUpdate={(id, patch) => dispatch({ type: 'loc/update', id, patch })}
                  onCopy={copy}
                />
                {s.showTimeline && (
                  <div className="lg-row-in px-1 pb-3 pt-2">
                    <TimezoneTimeline locations={group.locations} referenceZone={refZone} at={at} now={now} hour12={s.hour12} durationMin={state.meeting.durationMin}
                      overlap={overlap}
                      onChange={(v) => select(v)} labelWidth={92} rowHeight={22} showTimes={false} />
                  </div>
                )}
              </div>
            )}

            {group.locations.length > 0 && (
              <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-1.5">
                <MeetingOverlapIndicator className="min-w-0 flex-1 whitespace-nowrap" verdict={verdict} times={times} />
                <IconButton label="Share this time" shortcut="Ctrl+Shift+C" onClick={() => setLayer('share')}><Share2 size={15} /></IconButton>
              </div>
            )}
          </section>
        </main>
      )}

      {state.view === 'planner' && (
        <PlannerView
          key={group.id}
          group={group} refZone={refZone} refLabel={refLabel} at={at} now={now} live={live} fmt={fmt} step={s.step} reduced={reduced} coords={coords}
          durationMin={state.meeting.durationMin} groupSelector={groupSelector}
          onSelect={select} onReset={reset} onShare={() => setLayer('share')} onAdd={() => setLayer('search')} dstNotes={dstNotes}
          onDuration={(d) => dispatch({ type: 'meeting', patch: { durationMin: d } })}
        />
      )}

      {state.view === 'settings' && (
        <main className="lg-scroll min-h-0 flex-1 px-6 pt-5">
          <SettingsPanel settings={s} desktop={!!platform.desktop} desktopOS={platform.desktop ? platform.os : undefined} onChange={(patch) => dispatch({ type: 'settings', patch })} platformSupportsAutostart={platform.autostart.supported}
            onReplayOnboarding={() => dispatch({ type: 'onboard/replay' })} />
        </main>
      )}

      <TimezoneSearch
        open={layer === 'search'}
        onClose={() => setLayer(null)}
        onPick={addCity}
        existingZones={group.locations.map((l) => l.zone)}
        existingNames={group.locations.map((l) => l.name)}
        now={at}
        hour12={s.hour12}
      />

      <Dialog open={layer === 'share'} onClose={() => setLayer(null)} title="Share meeting time" width={420} className="lg-scroll max-h-[calc(100vh-80px)] !overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <LevelGlyph level={verdict.level} />
          <h3 className="text-title font-semibold">Share this time</h3>
          <span className="truncate text-caption text-ink-muted">· {verdict.headline}</span>
        </div>
        <div className="p-4">
          <MeetingSummary
            input={summary}
            now={now}
            session={exportSession}
            basis={recurrenceBasis}
            onBasis={setRecurrenceBasis}
            onNewEvent={() => { setExportSession(createExportSession()); setRecurrenceBasis('utc'); }}
            weekly={state.meeting.weekly}
            onTitle={(title) => dispatch({ type: 'meeting', patch: { title } })}
            onDuration={(d) => dispatch({ type: 'meeting', patch: { durationMin: d } })}
            onWeekly={(weekly) => dispatch({ type: 'meeting', patch: { weekly } })}
            onHour12={(h) => dispatch({ type: 'settings', patch: { hour12: h } })}
            onCopy={(t) => platform.copyText(t)}
            onExport={(name, ics) => platform.saveFile(name, ics, 'text/calendar')}
          />
        </div>
      </Dialog>

      {!state.onboarded && (
        <Onboarding now={now} hour12={s.hour12} onFinish={({ home, preset }) => {
          const locs: Location[] = presetCities(home, preset).map((c) => locationFromCity(c, s.defaultWork));
          const names: Record<string, string> = { team: 'My Team', us: 'US Clients', apac: 'APAC', empty: home.name };
          const g: Group = { id: uid('grp'), name: names[preset], locations: locs, referenceId: locs[0]?.id ?? null };
          dispatch({ type: 'onboard/done', groups: [g, ...state.groups.filter((x) => x.name !== g.name)] });
        }} />
      )}

      {toast && (
        <div role="status" className="lg-pop-in pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-md bg-surface px-3 py-1.5 text-label text-ink shadow-pop">{toast}</div>
      )}
      {storageNotice}
    </div>
  );
}

// ── Planner ────────────────────────────────────────────────────────────────

function PlannerView(p: {
  group: Group; refZone: string; refLabel: string; at: Instant; now: Instant; live: boolean; fmt: { hour12: boolean }; step: 1 | 5; reduced: boolean;
  coords?: { lat: number; lon: number }; durationMin: number; groupSelector: React.ReactNode; dstNotes: string[];
  onSelect(t: Instant): void; onReset(): void; onShare(): void; onAdd(): void; onDuration(d: number): void;
}) {
  const people = useMemo(() => toParticipants(p.group.locations), [p.group.locations]);
  const civilDay = dayNumber(p.refZone, p.at);
  const { start: dayStart, end: dayEnd } = useMemo(() => localDayBounds(p.refZone, p.at), [p.refZone, civilDay]);
  const verdict = evaluate(people, p.at, p.durationMin);
  const overlap = useMemo(() => commonWorkingRanges(people, dayStart, dayEnd), [people, dayStart, dayEnd]);
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [customDuration, setCustomDuration] = useState(false);
  // Custom searches retain the selection at Search; live ticks never rerank them.
  const near = request?.near ?? Math.floor(p.at / MS.MIN) * MS.MIN;
  const searchInput = useMemo(() => ({ people, from: request?.from ?? dayStart, to: request?.to ?? dayEnd, duration: p.durationMin, near,
    options: request ? { ...request.options, participantIds: request.options.participantIds?.filter(id => people.some(person => person.id === id)) } : {} }), [people, dayStart, dayEnd, p.durationMin, near, request]);
  const search = useSchedulingSearch(searchInput);
  const suggestions = search.suggestions;
  const times = Object.fromEntries(p.group.locations.map((l) => [l.id, formatTimeString(l.zone, p.at, p.fmt)]));
  const fmtRange = (r: { start: Instant; end: Instant }) => `${formatTimeString(p.refZone, r.start, p.fmt)}–${formatTimeString(p.refZone, r.end, p.fmt)}`;

  if (p.group.locations.length === 0) {
    return (
      <main className="flex flex-1 flex-col">
        <div className="flex h-12 items-center px-3">{p.groupSelector}</div>
        <EmptyState onAdd={p.onAdd} onQuickAdd={() => p.onAdd()} now={p.now} hour12={p.fmt.hour12} />
      </main>
    );
  }

  return (
    <main className="lg-scroll flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-5 px-4 pb-2 pt-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <InteractiveClock value={p.at} now={p.now} zone={p.refZone} coords={p.coords} live={p.live} step={p.step} hour12={p.fmt.hour12} size={136} reducedMotion={p.reduced}
            onChange={(v) => p.onSelect(v)} onReset={p.onReset} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {p.groupSelector}
            <PlannerSearchControls key={p.group.id} locations={p.group.locations} zone={p.refZone} at={p.at} durationMin={p.durationMin} hour12={p.fmt.hour12} request={request} onSearch={setRequest} onClear={() => setRequest(null)} />
            {!!suggestions.length && <button className="text-caption text-ink-muted underline decoration-line-strong underline-offset-2" aria-expanded={showReasons} onClick={() => setShowReasons(!showReasons)}>Why these times</button>}
            <div className="ml-auto flex items-center gap-1.5">
              <label className="sr-only" htmlFor="lg-plan-dur">Duration</label>
              <select id="lg-plan-dur" className="lg-select tnum w-[74px] text-body" value={customDuration ? 'custom' : p.durationMin} onChange={(e) => {
                setCustomDuration(e.target.value === 'custom'); if (e.target.value !== 'custom') p.onDuration(+e.target.value);
              }}>
                {[...new Set([15, 30, 45, 60, 90, 120, 180, 240, 480, 1440, p.durationMin])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
                <option value="custom">Custom minutes…</option>
              </select>
              {customDuration && <input aria-label="Custom duration minutes" type="number" min={1} max={1440} value={p.durationMin} onChange={e => { const n = +e.target.value; if (Number.isInteger(n) && n >= 1 && n <= 1440) p.onDuration(n); }} className="tnum w-16 rounded-md border border-line bg-field px-2 py-1 text-body" />}
              <Button variant="primary" icon={<Share2 size={13} />} onClick={p.onShare}>Share</Button>
            </div>
          </div>
          <div className="flex items-baseline gap-2 px-2">
            <span className="tnum text-[22px] font-medium leading-7 tracking-[-0.01em]">{formatTimeString(p.refZone, p.at, p.fmt)}</span>
            <span className="text-body text-ink-muted">{p.refLabel} · {new Intl.DateTimeFormat('en-US', { timeZone: p.refZone, weekday: 'short', month: 'short', day: 'numeric' }).format(p.at)}</span>
            {!p.live && <button onClick={p.onReset} className="text-caption text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">Now</button>}
          </div>
          <MeetingOverlapIndicator verdict={verdict} times={times} defaultOpen />
        </div>
      </div>

      <div className="shrink-0 border-t border-line px-4 pb-2 pt-2">
        <div className="mb-1 flex items-center gap-2">
          <CalendarRange size={13} className="text-ink-faint" aria-hidden />
          <span className="text-label font-medium text-ink">
            {overlap.length ? <>Everyone’s working hours overlap {overlap.map(fmtRange).join(', ')}</> : 'No shared working hours on this day'}
          </span>
          <span className="text-caption text-ink-faint">· drag the tracks to move the meeting</span>
        </div>
        <TimezoneTimeline locations={p.group.locations} referenceZone={p.refZone} at={p.at} now={p.now} hour12={p.fmt.hour12} durationMin={p.durationMin} overlap={overlap} onChange={(v) => p.onSelect(v)} />
        <Legend />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-label text-ink-muted"><Sparkles size={13} aria-hidden /> Suggested</span>
        {suggestions.map((sg) => (
          <button key={sg.start} onClick={() => p.onSelect(sg.start)} title={sg.reasons.join('\n')} aria-label={`${formatTimeString(p.refZone, sg.start, p.fmt)}. ${sg.reasons.join('. ')}`}
            className={cx('tnum flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-label', Math.abs(sg.start - p.at) < MS.MIN ? 'border-accent bg-accent-soft' : 'border-line hover:bg-field')}>
            <LevelGlyph level={sg.verdict.level} size={10} />
            {formatTimeString(p.refZone, sg.start, p.fmt)}
            {request && request.to - request.from > 25 * MS.HOUR && <span className="text-ink-faint">{new Intl.DateTimeFormat('en-US', { timeZone: p.refZone, month: 'short', day: 'numeric' }).format(sg.start)}</span>}
            <span className="text-ink-faint">{sg.verdict.people.filter((x) => x.state === 'work').length}/{sg.verdict.people.length}</span>
          </button>
        ))}
        {!suggestions.length && <span role="status" className="text-caption text-ink-muted">{search.pending ? 'Searching configured hours…' : search.error || 'No times meet these filters.'}</span>}
        {p.dstNotes.length > 0 && (
          <div className="ml-auto"><DstNotice>{p.dstNotes[0]}{p.dstNotes.length > 1 ? ` (+${p.dstNotes.length - 1} more)` : ''}</DstNotice></div>
        )}
      </div>
      {showReasons && <ol aria-label="Recommendation reasons" className="border-t border-line px-4 py-2 text-caption text-ink-muted">{suggestions.map(sg => <li key={sg.start} className="py-1">{formatTimeString(p.refZone, sg.start, p.fmt)} · {sg.reasons.join(' · ')}</li>)}</ol>}
    </main>
  );
}

function Legend() {
  const items = [
    ['var(--work-band)', 'Working'], ['var(--edge-band)', 'Within 1 h of work'], ['var(--off-band)', 'Off hours'], ['var(--sleep-band)', 'Sleeping'],
  ] as const;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted" style={{ paddingLeft: 136 }}>
      {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-[2px]" style={{ background: c }} />{l}</span>)}
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1px var(--work)' }} />Everyone working</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-[2px] bg-accent-soft" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} />Meeting</span>
    </div>
  );
}
