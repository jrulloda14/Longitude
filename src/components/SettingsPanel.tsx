/**
 * SettingsPanel — grouped preference rows, label left / control right.
 * Controls that need the OS (autostart) render disabled with a reason.
 */
import React, { useEffect, useState } from 'react';
import { WorkingHours, validateHours } from '../lib/schedule';
import { Segmented, Switch, cx } from '../primitives';
import type { Settings } from '../state/store';
import { TimeSelect } from './TimezoneList';

export interface SettingsPanelProps {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  platformSupportsAutostart: boolean;
  onReplayOnboarding?(): void;
}

function Row({ label, hint, children, disabled }: { label: string; hint?: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={cx('flex min-h-[44px] items-center gap-4 border-b border-line py-2 last:border-0', disabled && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="text-body text-ink">{label}</div>
        {hint && <div className="text-caption text-ink-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mb-5">
      <h3 className="mb-1 text-label font-semibold text-ink-muted">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function SettingsPanel({ settings: s, onChange, platformSupportsAutostart, onReplayOnboarding }: SettingsPanelProps) {
  const [work, setWorkDraft] = useState(s.defaultWork);
  const [workError, setWorkError] = useState('');
  useEffect(() => { setWorkDraft(s.defaultWork); }, [s.defaultWork]);
  const setWork = (patch: Partial<WorkingHours>) => {
    const next = { ...work, ...patch }; setWorkDraft(next);
    try { validateHours(next, { start: 0, end: 0 }); setWorkError(''); onChange({ defaultWork: next }); }
    catch (e) { setWorkError((e as Error).message); }
  };
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <Section title="Time">
        <Row label="Clock format" hint="Applies to the dial numerals, rows and summaries.">
          <Segmented label="Clock format" value={s.hour12 ? '12' : '24'} onChange={(v) => onChange({ hour12: v === '12' })}
            options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} />
        </Row>
        <Row label="Dial precision" hint="Drag, wheel and arrow keys snap to this. Hold Shift for 1 minute.">
          <Segmented label="Dial precision" value={String(s.step) as '1' | '5'} onChange={(v) => onChange({ step: v === '1' ? 1 : 5 })}
            options={[{ value: '5', label: '5 min' }, { value: '1', label: '1 min' }]} />
        </Row>
        <Row label="Default working hours" hint="Used for newly added locations. Edit any location from its ⋯ menu.">
          <div className="flex items-center gap-1.5">
            <TimeSelect label="Default start" value={work.start} onChange={(v) => setWork({ start: v })} hour12={s.hour12} />
            <span className="text-ink-faint">–</span>
            <TimeSelect label="Default end" value={work.end} onChange={(v) => setWork({ end: v })} hour12={s.hour12} />
          </div>
        </Row>
        {workError && <p role="alert" className="text-caption text-danger">{workError} Defaults are unchanged until valid.</p>}
        <Row label="Working days">
          <div role="group" aria-label="Default working days" className="flex gap-1">
            {DAYS.map((d, i) => {
              const on = work.days.includes(i);
              return (
                <button key={i} aria-pressed={on} onClick={() => setWork({ days: on ? work.days.filter((x) => x !== i) : [...work.days, i].sort() })}
                  className={cx('h-6 w-6 rounded-md text-caption font-medium', on ? 'bg-work-band text-ink shadow-[inset_0_0_0_1px_var(--work)]' : 'bg-field text-ink-faint hover:text-ink')}>
                  {d}
                </button>
              );
            })}
          </div>
        </Row>
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <Segmented label="Theme" value={s.theme} onChange={(v) => onChange({ theme: v })}
            options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </Row>
        <Row label="Reduce motion" hint="Hands jump instead of settling; no list animations.">
          <Segmented label="Reduce motion" value={s.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })}
            options={[{ value: 'system', label: 'System' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </Row>
        <Row label="Show timeline on Clock" hint="The 24-hour strip under the comparison rows.">
          <Switch label="Show timeline" checked={s.showTimeline} onChange={(v) => onChange({ showTimeline: v })} />
        </Row>
        <Row label="Window style preview" hint="Prototype only: shows the macOS title bar adaptation.">
          <Segmented label="Window style" value={s.chrome} onChange={(v) => onChange({ chrome: v })}
            options={[{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }]} />
        </Row>
      </Section>

      <Section title="Compact widget">
        <Row label="Keep on top of other windows">
          <Switch label="Keep widget on top" checked={s.widgetPinned} onChange={(v) => onChange({ widgetPinned: v })} />
        </Row>
        <Row label="Opacity">
          <div className="flex items-center gap-2">
            <input type="range" className="lg-range w-28" min={60} max={100} value={Math.round(s.widgetOpacity * 100)} aria-label="Widget opacity" onChange={(e) => onChange({ widgetOpacity: +e.target.value / 100 })} />
            <span className="tnum w-9 text-right text-caption text-ink-muted">{Math.round(s.widgetOpacity * 100)}%</span>
          </div>
        </Row>
      </Section>

      <Section title="System">
        <Row label="Show in system tray" hint="Left-click opens the widget; right-click for groups and Quit.">
          <Switch label="Tray icon" checked={s.trayIcon} onChange={(v) => onChange({ trayIcon: v })} />
        </Row>
        <Row label="Launch at sign-in" hint={platformSupportsAutostart ? undefined : 'Available in the desktop build.'} disabled={!platformSupportsAutostart}>
          <Switch label="Launch at sign-in" checked={false} onChange={() => {}} disabled={!platformSupportsAutostart} />
        </Row>
        <Row label="Global shortcut" hint="Show or hide the compact widget from anywhere.">
          <span className="rounded-md border border-line px-2 py-0.5 text-label text-ink-muted">{s.chrome === 'macos' ? '⌥⌘T' : 'Ctrl+Alt+T'}</span>
        </Row>
        {onReplayOnboarding && (
          <Row label="Welcome tour">
            <button onClick={onReplayOnboarding} className="text-label text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">Show again</button>
          </Row>
        )}
      </Section>
      <p className="pb-4 text-caption text-ink-faint">Time zone rules come from your system’s IANA database (via ICU). Longitude stores no offsets.</p>
    </div>
  );
}
