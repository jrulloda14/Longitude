/**
 * MeetingSummary — the share sheet. A live preview of exactly what will be
 * copied, plus copy / compact copy / .ics export and a weekly-repeat DST check.
 */
import { CalendarPlus, Check, Copy, Repeat } from 'lucide-react';
import React, { useState } from 'react';
import { SummaryInput, buildIcs, summaryCompact, summaryText } from '../lib/share';
import { Button, Segmented, Switch, cx } from '../primitives';
import { DstNotice, recurringShifts } from './DstNotice';

export interface MeetingSummaryProps {
  input: SummaryInput;
  weekly: boolean;
  onTitle(title: string): void;
  onDuration(min: number): void;
  onWeekly(on: boolean): void;
  onHour12(on: boolean): void;
  onCopy(text: string): Promise<boolean>;
  onExport(filename: string, ics: string): Promise<boolean>;
}

const DURATIONS = [15, 30, 45, 60, 90];
const WEEKS = 12;

export function MeetingSummary({ input, weekly, onTitle, onDuration, onWeekly, onHour12, onCopy, onExport }: MeetingSummaryProps) {
  const [compact, setCompact] = useState(false);
  const [done, setDone] = useState<null | 'copy' | 'ics' | 'error'>(null);
  const text = compact ? summaryCompact(input) : summaryText(input);
  const shifts = weekly ? recurringShifts(input.places, input.start, WEEKS, input.format) : [];

  const flash = (k: typeof done) => { setDone(k); setTimeout(() => setDone(null), 1400); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="lg-meeting-title">Meeting title</label>
        <input id="lg-meeting-title" value={input.title} onChange={(e) => onTitle(e.target.value)} placeholder="Meeting"
          className="lg-no-ring h-7 min-w-0 flex-1 rounded-md border border-transparent bg-field px-2 text-body font-medium outline-none placeholder:text-ink-faint hover:border-line focus:border-line-strong" />
        <label className="sr-only" htmlFor="lg-duration">Duration</label>
        <select id="lg-duration" className="lg-select tnum text-body" value={input.durationMin} onChange={(e) => onDuration(+e.target.value)}>
          {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60}${d % 60 ? '.5' : ''} h`}</option>)}
        </select>
      </div>

      <pre
        aria-label="Summary preview"
        className={cx('tnum m-0 whitespace-pre-wrap rounded-md border border-line bg-ground px-3 py-2.5 font-sans text-body text-ink', compact && 'text-label')}
        style={{ userSelect: 'text' }}
      >
        {text}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Summary format" value={compact ? 'compact' : 'full'} onChange={(v) => setCompact(v === 'compact')}
          options={[{ value: 'full', label: 'Full' }, { value: 'compact', label: 'One line' }]} />
        <Segmented size="sm" label="Clock format" value={input.format.hour12 ? '12' : '24'} onChange={(v) => onHour12(v === '12')}
          options={[{ value: '12', label: '12h' }, { value: '24', label: '24h' }]} />
        <label className="ml-auto flex items-center gap-2 text-label text-ink-muted">
          <Repeat size={12} aria-hidden /> Weekly
          <Switch checked={weekly} onChange={onWeekly} label="Repeat weekly" />
        </label>
      </div>

      {shifts.length > 0 && (
        <DstNotice>
          Repeats at a fixed UTC time, so clocks changing moves it locally:{' '}
          {shifts.map((s, i) => (
            <span key={s.place}>{i ? '; ' : ''}<b className="font-medium">{s.place}</b> {s.before} → {s.after} from {s.date}</span>
          ))}.
        </DstNotice>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" icon={done === 'copy' ? <Check size={13} /> : <Copy size={13} />}
          onClick={async () => flash((await onCopy(text)) ? 'copy' : 'error')}>
          {done === 'copy' ? 'Copied' : compact ? 'Copy line' : 'Copy summary'}
        </Button>
        <Button variant="secondary" icon={done === 'ics' ? <Check size={13} /> : <CalendarPlus size={13} />}
          onClick={async () => {
            const ics = buildIcs(input, { weeklyCount: weekly ? WEEKS : undefined });
            const name = `${(input.title || 'meeting').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'meeting'}.ics`;
            flash((await onExport(name, ics)) ? 'ics' : 'error');
          }}>
          {done === 'ics' ? 'Saved' : 'Export .ics'}
        </Button>
        {done === 'error' && <span role="alert" className="text-caption text-danger">Couldn’t reach the clipboard or disk. Try again.</span>}
      </div>
    </div>
  );
}
