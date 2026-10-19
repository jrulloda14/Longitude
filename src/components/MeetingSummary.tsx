/** The existing share sheet; preview and copy use the same canonical-input builders. */
import { CalendarPlus, Check, Copy, Repeat } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SummaryInput, ExportSession, RecurrenceBasis, buildIcs, createExportSession, safeCalendarName, summaryCompact, summaryParticipants, summaryText, summaryUtc } from '../lib/share';
import { meetingDstNotes, recurringShifts } from '../lib/meeting-dst';
import { SaveResult } from '../platform';
import { Button, Segmented, Switch, cx } from '../primitives';
import { DstNotice } from './DstNotice';
export interface MeetingSummaryProps {
  input: SummaryInput; weekly: boolean; basis?: RecurrenceBasis; onBasis?(basis: RecurrenceBasis): void; now?: number; session?: ExportSession; onNewEvent?(): void;
  onTitle(title: string): void; onDuration(min: number): void; onWeekly(on: boolean): void; onHour12(on: boolean): void;
  onCopy(text: string): Promise<boolean>; onExport(filename: string, ics: string): Promise<SaveResult>;
}
const DURATIONS = [15, 30, 45, 60, 90], WEEKS = 12;
export function MeetingSummary({ input, weekly, basis: controlledBasis, onBasis, now = input.start, session, onNewEvent, onTitle, onDuration, onWeekly, onHour12, onCopy, onExport }: MeetingSummaryProps) {
  const [mode, setMode] = useState('full'), [localBasis, setLocalBasis] = useState<RecurrenceBasis>('utc');
  const basis = controlledBasis ?? localBasis;
  const changeBasis = onBasis ?? setLocalBasis;
  const [localSession, setSession] = useState(createExportSession), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: boolean; text: string; kind?: 'copy' | 'ics' } | null>(null);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const data = useMemo(() => {
    try {
      const s: SummaryInput = { ...input, recurrence: weekly ? { basis, count: WEEKS } : undefined };
      const text = mode === 'full' ? summaryText(s) : mode === 'compact' ? summaryCompact(s) : mode === 'local' ? summaryParticipants(s) : summaryUtc(s);
      return { input: s, text, error: '', notes: meetingDstNotes(s, now), shifts: weekly ? recurringShifts(s.places, s.start, WEEKS, s.format, basis, s.reference.zone) : [] };
    } catch (e) { return { input, text: '', error: String(e).replace(/^\w+Error: /, ''), notes: [], shifts: [] }; }
  }, [input, weekly, basis, mode, now]);
  const run = async (task: () => Promise<{ error?: boolean; text: string; kind?: 'copy' | 'ics' }>) => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setFeedback(null);
    try { const result = await task(); if (mounted.current) setFeedback(result); }
    catch (e) { if (mounted.current) setFeedback({ error: true, text: `Could not share: ${String(e)}` }); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const labels: Record<string, string> = { full: 'Copy summary', compact: 'Copy line', local: 'Copy local times', utc: 'Copy UTC' };
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="lg-meeting-title">Meeting title</label>
      <input id="lg-meeting-title" maxLength={500} value={input.title} onChange={e => { onTitle(e.target.value); setFeedback(null); }} placeholder="Meeting" aria-invalid={!!data.error}
        className="lg-no-ring h-7 min-w-0 flex-1 rounded-md border border-transparent bg-field px-2 text-body font-medium outline-none placeholder:text-ink-faint hover:border-line focus:border-line-strong" />
      <label className="sr-only" htmlFor="lg-duration">Duration</label>
      <select id="lg-duration" className="lg-select tnum text-body" value={input.durationMin} onChange={e => onDuration(+e.target.value)}>
        {[...new Set([...DURATIONS, input.durationMin])].sort((a,b) => a-b).map(d => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
      </select>
    </div>
    {data.error ? <p role="alert" className="text-caption text-danger">{data.error}</p> : <pre aria-label="Summary preview"
      className={cx('tnum m-0 whitespace-pre-wrap rounded-md border border-line bg-ground px-3 py-2.5 font-sans text-body text-ink', mode !== 'full' && 'text-label')}
      style={{ userSelect: 'text', overflowWrap: 'anywhere' }}>{data.text}</pre>}
    <div className="flex flex-wrap items-center gap-2">
      <Segmented size="sm" label="Summary format" value={mode} onChange={v => { setMode(v); setFeedback(null); }} options={[{value:'full',label:'Full'},{value:'compact',label:'One line'},{value:'local',label:'Local times'},{value:'utc',label:'UTC'}]} />
      <Segmented size="sm" label="Clock format" value={input.format.hour12 ? '12' : '24'} onChange={v => onHour12(v === '12')} options={[{value:'12',label:'12h'},{value:'24',label:'24h'}]} />
      <label className="ml-auto flex items-center gap-2 text-label text-ink-muted"><Repeat size={12} aria-hidden /> Weekly <Switch checked={weekly} onChange={onWeekly} label="Repeat weekly" /></label>
    </div>
    {weekly && <label className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">12 occurrences, repeat by
      <select aria-label="Recurrence time basis" className="lg-select text-caption" value={basis} onChange={e => changeBasis(e.target.value as RecurrenceBasis)}><option value="utc">Fixed UTC</option><option value="reference">{input.reference.zone} wall time</option></select>
    </label>}
    {data.shifts.length > 0 && <DstNotice>Repeats at {basis === 'utc' ? 'fixed UTC' : `${input.reference.zone} wall time`}; local meeting times change: {data.shifts.map((s,i) => <span key={`${s.place}-${i}`}>{i ? '; ' : ''}<b className="font-medium">{s.place}</b> {s.before} → {s.after} from {s.date}</span>)}.</DstNotice>}
    {data.notes.map((note,i) => <DstNotice key={i} tone="quiet">{note}</DstNotice>)}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" disabled={busy || !!data.error} icon={feedback?.kind === 'copy' ? <Check size={13}/> : <Copy size={13}/>} onClick={() => void run(async () => await onCopy(data.text) ? {text:'Copied selected text.',kind:'copy'} : {error:true,text:'Could not copy. Clipboard access may be unavailable or denied.'})}>{feedback?.kind === 'copy' ? 'Copied' : labels[mode]}</Button>
      <button disabled={busy} className="text-caption text-ink-muted underline decoration-line-strong underline-offset-2" onClick={() => { if (onNewEvent) onNewEvent(); else setSession(createExportSession()); setFeedback({text:'New calendar event identity created.'}); }}>New event</button>
      <Button variant="secondary" disabled={busy || !!data.error} icon={feedback?.kind === 'ics' ? <Check size={13}/> : <CalendarPlus size={13}/>} onClick={() => void run(async () => {
        const identity = session ?? localSession;
        const result = await onExport(safeCalendarName(input.title), buildIcs(data.input, { uid: identity.uid, created: identity.created }));
        return result.status === 'saved' ? {text:'Calendar file saved.',kind:'ics'} : result.status === 'downloaded' ? {text:'Calendar download started.'} : result.status === 'cancelled' ? {text:'Save cancelled.'} : {error:true,text:`Could not save calendar: ${result.message}`};
      })}>{feedback?.kind === 'ics' ? 'Saved' : 'Export .ics'}</Button>

    </div>
    {busy && <p role="status" className="text-caption text-ink-muted">Sharing…</p>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={cx('text-caption', feedback.error ? 'text-danger' : 'text-ink-muted')}>{feedback.text}</p>}
  </div>;
}
