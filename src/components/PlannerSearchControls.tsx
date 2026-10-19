import React, { useState } from 'react';
import { SearchOptions } from '../lib/schedule';
import { Instant, MS, formatShortDate, resolveWall, wallTime } from '../lib/time';
import { localDayBounds } from '../lib/time-axis';
import { Button, Dialog } from '../primitives';
import type { Location } from '../state/store';
import { TimeSelect } from './TimezoneList';

export interface SearchRequest { from: Instant; to: Instant; near: Instant; options: SearchOptions }
const dateText = (zone: string, at: Instant) => {
  const w = wallTime(zone, at); return `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
};
export function PlannerSearchControls({ locations, zone, at, durationMin, hour12, onSearch, onClear, request }: {
  locations: Location[]; zone: string; at: Instant; durationMin: number; hour12: boolean;
  request: SearchRequest | null; onSearch(request: SearchRequest): void; onClear(): void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [preferred, setPreferred] = useState(false), [start, setStart] = useState(540), [end, setEnd] = useState(1020);
  const [minPeople, setMinPeople] = useState(0), [minOverlap, setMinOverlap] = useState(0), [fairness, setFairness] = useState(false);
  const [error, setError] = useState('');
  const show = () => {
    setFrom(dateText(zone, request?.from ?? at)); setTo(dateText(zone, request ? request.to - 1 : at));
    setIds(request?.options.participantIds?.filter(id => locations.some(l => l.id === id)) ?? locations.map(l => l.id));
    setPreferred(!!request?.options.preferred); setStart(request?.options.preferred?.start ?? 540); setEnd(request?.options.preferred?.end ?? 1020);
    setMinPeople(request?.options.minParticipants ?? 0); setMinOverlap(Math.min(durationMin, request?.options.minOverlapMin ?? 0));
    setFairness(request?.options.fairness ?? false); setError(''); setOpen(true);
  };
  const submit = () => {
    try {
      const parse = (text: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text); if (!m) throw new Error('Choose valid start and end dates.');
        const r = resolveWall(zone, +m[1], +m[2], +m[3], 0, 0), w = wallTime(zone, r.instant);
        if (w.year !== +m[1] || w.month !== +m[2] || w.day !== +m[3]) throw new Error('That local date does not exist.');
        return r.instant;
      };
      const first = localDayBounds(zone, parse(from)).start, last = localDayBounds(zone, parse(to)).end;
      if (last <= first || last - first > 31 * MS.DAY) throw new Error('Choose an ordered range of at most 31 elapsed days.');
      if (!ids.length) throw new Error('Select at least one recommendation participant.');
      if (minPeople > ids.length) throw new Error('Minimum working locations exceeds the selected count.');
      if (minOverlap > durationMin) throw new Error('Minimum shared minutes exceeds meeting duration.');
      if (preferred && start === end) throw new Error('Preferred start and end must differ.');
      onSearch({ from: first, to: last, near: at, options: { participantIds: ids, minParticipants: minPeople, minOverlapMin: minOverlap, fairness, ...(preferred ? { preferred: { zone, start, end } } : {}) } });
      setOpen(false);
    } catch (e) { setError((e as Error).message); }
  };
  return <>
    <button onClick={show} className="text-caption text-ink-muted underline decoration-line-strong underline-offset-2">Search options</button>
    {request && <span className="text-caption text-ink-faint">{formatShortDate(zone, request.from)}–{formatShortDate(zone, request.to - 1)} · {request.options.participantIds?.length ?? locations.length} locations <button className="underline" onClick={onClear}>Clear filters</button></span>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Recommendation search" width={420} className="lg-scroll max-h-[calc(100vh-80px)] !overflow-y-auto">
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="p-4">
        <h3 className="text-title font-semibold">Recommendation search</h3>
        <p className="mt-1 text-caption text-ink-muted">Configured hours only, not calendar availability. Timeline and meeting suitability still compare the whole group.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="text-caption text-ink-muted">From ({zone})<input aria-label="Search from date" type="date" required min="0002-01-01" max="9998-12-30" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded-md border border-line bg-field px-2 py-1 text-body text-ink" /></label>
          <label className="text-caption text-ink-muted">Through (inclusive)<input aria-label="Search through date" type="date" required min="0002-01-01" max="9998-12-30" value={to} onChange={e => setTo(e.target.value)} className="mt-1 block rounded-md border border-line bg-field px-2 py-1 text-body text-ink" /></label>
        </div>
        <fieldset className="mt-3"><legend className="text-label text-ink-muted">Recommendation participants</legend>
          <div className="mt-1 flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-auto">{locations.map(l => <label key={l.id} className="flex items-center gap-1 text-caption"><input type="checkbox" checked={ids.includes(l.id)} onChange={e => setIds(e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id))} />{l.name}</label>)}</div>
        </fieldset>
        <label className="mt-3 flex items-center gap-2 text-caption"><input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)} />Require entire meeting inside preferred window ({zone})</label>
        {preferred && <div className="mt-1 flex items-center gap-2"><TimeSelect value={start} onChange={setStart} label="Preferred starts" hour12={hour12} /><span className="text-caption text-ink-muted">to</span><TimeSelect value={end} onChange={setEnd} label="Preferred ends" hour12={hour12} /></div>}
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-caption text-ink-muted">Fully working locations<input aria-label="Minimum fully working locations" type="number" min={0} max={ids.length} value={minPeople} onChange={e => setMinPeople(+e.target.value)} className="mt-1 block w-20 rounded-md border border-line bg-field px-2 py-1 text-body text-ink" /></label>
          <label className="text-caption text-ink-muted">Shared working minutes<input aria-label="Minimum shared working minutes" type="number" min={0} max={durationMin} value={minOverlap} onChange={e => setMinOverlap(+e.target.value)} className="mt-1 block w-20 rounded-md border border-line bg-field px-2 py-1 text-body text-ink" /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-caption"><input type="checkbox" checked={fairness} onChange={e => setFairness(e.target.checked)} />Balance the worst individual inconvenience when totals tie</label>
        <p className="mt-1 text-caption text-ink-faint">Fairness starts equally for everyone; no past meetings are tracked. Search ranks near the selected time when Search is pressed. Meetings may start every 30 minutes.</p>
        {error && <p role="alert" className="mt-2 text-caption text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Search</Button></div>
      </form>
    </Dialog>
  </>;
}
