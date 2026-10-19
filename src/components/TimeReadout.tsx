/**
 * TimeReadout — the digital twin of the dial and its accessible alternative.
 * Shows the selected time large; it IS an input: click or Tab in, type
 * "14:30", "2:30p", "noon", press Enter. Resolves DST gaps/overlaps and says so.
 */
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseTimeOfDay } from '../lib/parse';
import {
  Instant, addLocalDays, formatOffset, formatShortDate, formatTime, formatTimeString, offsetMinutes, relativeDay, relativeSpan,
  resolveWall, wallTime, zoneAbbreviation, WallResolution,
} from '../lib/time';
import { Button, IconButton, Popover, Tip, cx } from '../primitives';
import { DstNotice } from './DstNotice';

export interface TimeReadoutProps {
  value: Instant;
  now: Instant;
  zone: string;
  placeLabel: string;
  live: boolean;
  hour12: boolean;
  onChange(next: Instant, source: 'input' | 'key'): void;
  onReset(): void;
  compact?: boolean;
}

export function TimeReadout({ value, now, zone, placeLabel, live, hour12, onChange, onReset, compact }: TimeReadoutProps) {
  const { time, period } = formatTime(zone, value, { hour12 });
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<WallResolution | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const closeDate = () => { setDateOpen(false); dateButtonRef.current?.focus(); };

  // A new value from elsewhere clears any stale DST note.
  const lastCommitted = useRef<Instant | null>(null);
  useEffect(() => {
    if (lastCommitted.current !== null && lastCommitted.current !== value) setResolution(null);
  }, [value]);

  const apply = (res: WallResolution) => {
    setError(null); setDraft(null);
    setResolution(res.kind === 'ok' ? null : res);
    lastCommitted.current = res.instant;
    onChange(res.instant, 'input');
  };
  const commit = () => {
    if (draft === null) return;
    const r = parseTimeOfDay(draft, hour12);
    if (!r.ok) { setError(r.error); return; }
    const w = wallTime(zone, value);
    const res = resolveWall(zone, w.year, w.month, w.day, Math.floor(r.minutes / 60), r.minutes % 60);
    apply(res);
    inputRef.current?.blur();
  };

  const stepDay = (d: 1 | -1) => {
    try { setError(null); setResolution(null); onChange(addLocalDays(zone, value, d), 'key'); }
    catch { setError('That date is outside the supported range.'); }
  };
  const togglePeriod = () => {
    const w = wallTime(zone, value);
    apply(resolveWall(zone, w.year, w.month, w.day, (w.hour + 12) % 24, w.minute));
  };
  const openDate = () => {
    const w = wallTime(zone, value);
    setDateDraft(`${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`);
    setDateOpen(!dateOpen);
  };
  const commitDate = () => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateDraft);
    try {
      if (!match) throw new Error('Invalid date');
      const w = wallTime(zone, value);
      apply(resolveWall(zone, +match[1], +match[2], +match[3], w.hour, w.minute));
      closeDate();
    } catch { setError('Enter a valid date between years 0001 and 9999.'); }
  };
  const abbr = zoneAbbreviation(zone, value);
  const offs = formatOffset(offsetMinutes(zone, value));

  return (
    <div className={cx('flex flex-col items-center', compact ? 'gap-1' : 'gap-1.5')}>
      <div className="flex items-baseline gap-1.5">
        <label className="sr-only" htmlFor="lg-time-input">Selected time in {placeLabel}</label>
        <input
          id="lg-time-input"
          ref={inputRef}
          className={cx(
            'lg-no-ring tnum w-[5.2ch] rounded-md border border-transparent bg-transparent text-center font-medium tracking-[-0.02em] text-ink outline-none transition-colors',
            compact ? 'text-[28px] leading-[32px]' : 'text-readout',
            'hover:border-line focus:border-line-strong focus:bg-field',
            error && '!border-danger',
          )}
          style={{ width: `${Math.max(4.2, (draft ?? time).length + 0.2)}ch` }}
          value={draft ?? time}
          aria-invalid={!!error}
          aria-describedby={error ? 'lg-time-err' : undefined}
          onFocus={(e) => {
            // Commit the editable AM/PM text before selecting it; a deferred
            // value change can append a fast first keystroke to the old time.
            flushSync(() => setDraft(time + (period ? ' ' + period.toLowerCase() : '')));
            e.currentTarget.select();
          }}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onBlur={() => { if (!error) setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(null); setError(null); inputRef.current?.blur(); }
          }}
          spellCheck={false}
          autoComplete="off"
        />
        {period && draft === null && <button type="button" aria-label={`Switch to ${period === 'AM' ? 'PM' : 'AM'}`} title="Switch AM/PM"
          onClick={togglePeriod} className="rounded-sm text-label font-semibold tracking-[0.06em] text-ink-muted">{period}</button>}
      </div>

      {error ? (
        <p id="lg-time-err" role="alert" className="text-caption text-danger">{error}</p>
      ) : (
        <div className="flex items-center gap-0.5 text-label text-ink-muted">
          <IconButton label="Previous day" shortcut="[" className="!h-6 !w-6" onClick={() => stepDay(-1)}><ChevronLeft size={14} /></IconButton>
          <div className="relative">
          <button ref={dateButtonRef} type="button" aria-label="Choose planning date" aria-expanded={dateOpen} aria-haspopup="dialog" onClick={openDate} className="tnum min-w-[120px] rounded-sm text-center">
            <span className={cx(relativeDay(zone, value, now) !== 'Today' && 'text-ink')}>{relativeDay(zone, value, now)}</span>
            <span className="text-ink-faint"> · </span>
            {formatShortDate(zone, value)}
          </button>
          <Popover open={dateOpen} onClose={closeDate} label="Planning date" className="left-1/2 top-7 w-[264px] !p-3" style={{ marginLeft: -132 }}>
            <form onSubmit={e => { e.preventDefault(); commitDate(); }} className="flex items-center gap-2">
              <input type="date" aria-label="Planning date" autoFocus min="0001-01-01" max="9999-12-31" value={dateDraft}
                onChange={e => setDateDraft(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-field px-2 py-1 text-body text-ink" />
              <Button type="submit" size="sm">Set date</Button>
            </form>
          </Popover>
          </div>
          <IconButton label="Next day" shortcut="]" className="!h-6 !w-6" onClick={() => stepDay(1)}><ChevronRight size={14} /></IconButton>
        </div>
      )}

      {!compact && (
        <div className="flex items-center gap-2 text-caption text-ink-faint">
          <Tip label={`${zone} · ${offs}`}>
            <span tabIndex={0} className="rounded-sm">{placeLabel} · {abbr}{abbr.startsWith('UTC') ? '' : ` ${offs}`}</span>
          </Tip>
          <span aria-hidden>·</span>
          {live ? (
            <span className="inline-flex items-center gap-1 text-ink-muted"><span className="lg-pulse h-1.5 w-1.5 rounded-full bg-work" /> Live</span>
          ) : (
            <span className="tnum">{relativeSpan(value, now)}</span>
          )}
        </div>
      )}

      <div className="h-7">
        {!live && (
          <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={onReset} title="Back to now (Home, or double-click the dial)">
            Now · {formatTimeString(zone, now, { hour12 })}
          </Button>
        )}
      </div>

      {resolution && resolution.kind === 'ambiguous' && (
        <DstNotice tone="info">
          {formatTimeString(zone, resolution.alternatives[0], { hour12 })} happens twice in {placeLabel} that night (clocks go back). Using the first, {zoneAbbreviation(zone, resolution.alternatives[0])}.{' '}
          <button className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" onClick={() => { const alt = resolution.alternatives[1]; lastCommitted.current = alt; onChange(alt, 'input'); setResolution(null); }}>
            Use the second ({zoneAbbreviation(zone, resolution.alternatives[1])})
          </button>
        </DstNotice>
      )}
      {resolution && resolution.kind === 'nonexistent' && (
        <DstNotice tone="info">
          That time doesn't exist in {placeLabel} — clocks skip ahead {resolution.gapMinutes} min. Moved to {formatTimeString(zone, resolution.instant, { hour12 })}.
        </DstNotice>
      )}
    </div>
  );
}
