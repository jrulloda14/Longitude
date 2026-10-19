/**
 * MeetingOverlapIndicator — does this time work, and why.
 * Level is carried by glyph shape + word + color (never color alone):
 *   good ●  full disc      partial ◐ half disc      poor ○ ring with moon cut
 */
import React, { useState } from 'react';
import { DayState, OverlapVerdict, STATE_LABEL } from '../lib/schedule';
import { cx } from '../primitives';

const LEVEL = {
  good: { word: 'Good overlap', color: 'var(--work)' },
  partial: { word: 'Partial overlap', color: 'var(--edge)' },
  poor: { word: 'Poor overlap', color: 'var(--sleep)' },
  none: { word: 'No locations', color: 'var(--ink-faint)' },
} as const;

export function LevelGlyph({ level, size = 12 }: { level: OverlapVerdict['level']; size?: number }) {
  const c = LEVEL[level].color;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <circle cx="6" cy="6" r="5" fill="none" stroke={c} strokeWidth="1.4" />
      {level === 'good' && <circle cx="6" cy="6" r="3" fill={c} />}
      {level === 'partial' && <path d="M6 3a3 3 0 0 1 0 6z" fill={c} />}
    </svg>
  );
}

const STATE_DOT: Record<DayState, string> = { work: 'var(--work)', edge: 'var(--edge)', off: 'var(--ink-faint)', sleep: 'var(--sleep)' };

export interface MeetingOverlapIndicatorProps {
  verdict: OverlapVerdict;
  /** per-person local time strings, keyed by participant id */
  times: Record<string, string>;
  /** start expanded (planner) or collapsed to the headline (clock view) */
  defaultOpen?: boolean;
  className?: string;
}

export function MeetingOverlapIndicator({ verdict, times, defaultOpen = false, className }: MeetingOverlapIndicatorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const lv = LEVEL[verdict.level];
  const outside = verdict.people.filter((p) => p.state !== 'work');
  return (
    <section aria-label="Meeting time suitability" className={cx('text-body', className)}>
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={verdict.level === 'none'}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-field"
      >
        <LevelGlyph level={verdict.level} />
        <span className="font-medium" style={{ color: lv.color }}>{lv.word}</span>
        <span className="truncate text-ink-muted">· {verdict.headline}</span>
        {verdict.level !== 'none' && <span className="ml-auto text-caption text-ink-faint">{open ? 'Hide' : 'Why'}</span>}
      </button>
      <span className="sr-only" aria-live="polite">{lv.word}. {verdict.headline}.</span>
      {open && verdict.level !== 'none' && (
        <ul className="mt-0.5 flex flex-col px-2 pb-1">
          {(verdict.level === 'good' ? verdict.people : [...outside, ...verdict.people.filter((p) => p.state === 'work')]).map((p) => (
            <li key={p.id} className="tnum flex h-6 items-center gap-2 text-caption">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATE_DOT[p.state] }} />
              <span className="w-[112px] truncate text-ink">{p.label}</span>
              <span className="w-[72px] text-ink-muted">{times[p.id]}</span>
              <span className={cx(p.state === 'work' ? 'text-ink-faint' : 'text-ink-muted')}>{STATE_LABEL[p.state]}</span>
            </li>
          ))}
          <li className="mt-1 text-[10px] leading-[14px] text-ink-faint">Based on the working hours you set for each location — not on anyone’s calendar.</li>
        </ul>
      )}
    </section>
  );
}
