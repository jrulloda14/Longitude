/**
 * Onboarding (first run, 2 steps) and EmptyState (a group with no locations).
 * Step 1 confirms home; step 2 picks a starting set. The dial teaches itself
 * afterwards with a one-time coach mark (see App).
 */
import { ArrowRight, Plus } from 'lucide-react';
import React, { useState } from 'react';
import { CITIES, City, cityById } from '../lib/cities';
import { Instant, formatOffset, formatTimeString, offsetMinutes, systemZone } from '../lib/time';
import { Button, Kbd, cx } from '../primitives';
import { InteractiveClock } from './InteractiveClock';

export interface OnboardingProps {
  now: Instant;
  hour12: boolean;
  onFinish(choice: { home: City; preset: 'team' | 'apac' | 'us' | 'empty' }): void;
}

const PRESETS = [
  { id: 'team', name: 'My Team', cities: ['new-york', 'london', 'sydney'] },
  { id: 'us', name: 'US Clients', cities: ['new-york', 'chicago', 'los-angeles'] },
  { id: 'apac', name: 'APAC', cities: ['singapore', 'mumbai', 'tokyo'] },
  { id: 'empty', name: 'Start empty', cities: [] },
] as const;

export function Onboarding({ now, hour12, onFinish }: OnboardingProps) {
  const sys = systemZone();
  const detected = CITIES.find((c) => c.zone === sys) ?? cityById('manila')!;
  const [home, setHome] = useState<City>(detected);
  const [step, setStep] = useState<1 | 2>(1);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('team');
  const [preview, setPreview] = useState<Instant | null>(null);
  const homeChoices = Array.from(new Map([detected, ...CITIES.filter((c) => c.zone === sys && c.id !== detected.id)].map((c) => [c.id, c])).values());

  return (
    <div className="absolute inset-x-0 bottom-0 top-10 z-30 flex bg-ground">
      <div className="flex w-[46%] min-w-[300px] flex-col items-center justify-center gap-4 border-r border-line">
        <InteractiveClock value={preview ?? now} now={now} zone={home.zone} coords={home} live={preview === null} hour12={hour12} size={232}
          onChange={(v) => setPreview(v)} onReset={() => setPreview(null)} />
        <p className="max-w-[240px] text-center text-caption text-ink-muted">
          {preview === null ? 'Try it — drag the minute hand.' : 'Every city follows. Double-click to snap back to now.'}
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-center px-10">
        <div className="text-caption text-ink-faint">Step {step} of 2</div>
        {step === 1 ? (
          <>
            <h1 className="mt-1 text-[22px] font-semibold leading-[28px] tracking-[-0.01em]">Where are you?</h1>
            <p className="mt-1.5 max-w-[340px] text-body text-ink-muted">Your system says <span className="text-ink">{sys.replace(/_/g, ' ')}</span>. The dial reads in this zone unless you choose another reference.</p>
            <div role="radiogroup" aria-label="Home location" className="mt-5 flex flex-col gap-1">
              {homeChoices.slice(0, 4).map((c) => (
                <button key={c.id} role="radio" aria-checked={home.id === c.id} onClick={() => setHome(c)}
                  className={cx('flex h-10 max-w-[340px] items-center gap-3 rounded-md px-3 text-left', home.id === c.id ? 'bg-accent-soft' : 'hover:bg-field')}>
                  <span className={cx('h-3 w-3 rounded-full border', home.id === c.id ? 'border-[4px] border-accent' : 'border-line-strong')} />
                  <span className="flex-1 text-body font-medium">{c.name}<span className="font-normal text-ink-muted"> · {c.country}</span></span>
                  <span className="tnum text-caption text-ink-muted">{formatTimeString(c.zone, now, { hour12 })} · {formatOffset(offsetMinutes(c.zone, now))}</span>
                </button>
              ))}
            </div>
            <div className="mt-6"><Button variant="primary" onClick={() => setStep(2)}>Continue <ArrowRight size={13} /></Button></div>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-[22px] font-semibold leading-[28px] tracking-[-0.01em]">Who do you work with?</h1>
            <p className="mt-1.5 max-w-[340px] text-body text-ink-muted">Pick a starting group. You can rename it, add cities with <Kbd>Ctrl K</Kbd>, and keep several groups.</p>
            <div role="radiogroup" aria-label="Starting group" className="mt-5 grid max-w-[360px] grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id} role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)}
                  className={cx('flex h-[58px] flex-col justify-center rounded-md border px-3 text-left', preset === p.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-field')}>
                  <span className="text-body font-medium">{p.name}</span>
                  <span className="truncate text-caption text-ink-muted">{p.cities.length ? [home.name, ...p.cities.map((id) => cityById(id)!.name)].join(', ') : 'Just ' + home.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => onFinish({ home, preset })}>Start using Longitude</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function presetCities(home: City, preset: 'team' | 'apac' | 'us' | 'empty'): City[] {
  const p = PRESETS.find((x) => x.id === preset)!;
  return [home, ...p.cities.map((id) => cityById(id)!).filter((c) => c.zone !== home.zone || c.name !== home.name)];
}

export function EmptyState({ onAdd, onQuickAdd, now, hour12 }: { onAdd(): void; onQuickAdd(c: City): void; now: Instant; hour12: boolean }) {
  const quick = ['london', 'new-york', 'tokyo', 'sydney'].map((id) => cityById(id)!);
  return (
    <div className="flex flex-1 flex-col items-start justify-center px-4 py-8">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="mb-3">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--control-border)" strokeDasharray="2 3" />
        <path d="M20 9v11l6 4" fill="none" stroke="var(--ink-muted)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <h2 className="text-title font-semibold">No locations in this group</h2>
      <p className="mt-1 max-w-[300px] text-body text-ink-muted">Add the cities you compare most. The dial stays on your own time zone until you pick a reference.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {quick.map((c) => (
          <button key={c.id} onClick={() => onQuickAdd(c)} className="tnum flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-label hover:bg-field">
            <Plus size={12} className="text-ink-faint" aria-hidden /> {c.name}
            <span className="text-ink-faint">{formatTimeString(c.zone, now, { hour12 })}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" icon={<Plus size={13} />} onClick={onAdd}>Search cities</Button>
        <span className="text-caption text-ink-faint">or press <Kbd>Ctrl K</Kbd></span>
      </div>
    </div>
  );
}
