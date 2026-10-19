/**
 * TimezoneSearch — command-palette style add dialog (Ctrl+K / ⌘K).
 * Searches city, country, aliases, live abbreviations (BST), IANA ids
 * (Asia/Kathmandu) and offsets (+5:30). Fully keyboard driven.
 */
import { Check, Search } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { City, cityById } from '../lib/cities';
import { SearchResult, describeMatch, searchCities } from '../lib/search';
import { Instant, MS, formatOffset, formatTimeString, offsetMinutes } from '../lib/time';
import { Dialog, Kbd, Spinner, cx } from '../primitives';

export interface TimezoneSearchProps {
  open: boolean;
  onClose(): void;
  onPick(city: City): void;
  /** zones already in the active group — shown as "Added", not pickable */
  existingZones: string[];
  existingNames: string[];
  now: Instant;
  hour12: boolean;
  /** show the loading skeleton (production: while the large city index loads) */
  loading?: boolean;
}

const SUGGESTED = ['london', 'new-york', 'tokyo', 'singapore', 'sydney', 'berlin', 'dubai', 'los-angeles'];

export function TimezoneSearch({ open, onClose, onPick, existingZones, existingNames, now, hour12, loading }: TimezoneSearchProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const searchAt = Math.floor(now / MS.MIN) * MS.MIN;
  const results: SearchResult[] = useMemo(() => {
    if (!open) return [];
    if (!q.trim()) return SUGGESTED.map((id) => cityById(id)).filter(Boolean).map((city) => ({ city: city!, match: 'name' as const, score: 0 }));
    return searchCities(q, searchAt, 30);
  }, [q, searchAt, open]);

  const isAdded = (c: City) => existingNames.includes(c.name) && existingZones.includes(c.zone);
  useEffect(() => { setActive(Math.max(0, results.findIndex((r) => !isAdded(r.city)))); }, [results]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (r: SearchResult | undefined) => { if (r && !isAdded(r.city)) { onPick(r.city); onClose(); } };
  const move = (d: number) => {
    if (!results.length) return;
    let j = active;
    for (let k = 0; k < results.length; k++) { j = (j + d + results.length) % results.length; if (!isAdded(results[j].city)) break; }
    setActive(j);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add a location" width={460}>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="lg-search-list"
          aria-activedescendant={results[active] ? `lg-opt-${active}` : undefined}
          aria-label="Search cities or time zones"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
          }}
          placeholder="City, country, Asia/Tokyo, BST or +5:30"
          className="lg-no-ring h-11 min-w-0 flex-1 bg-transparent text-title outline-none placeholder:text-ink-faint"
          spellCheck={false}
          autoComplete="off"
        />
        {loading ? <Spinner /> : <Kbd>Esc</Kbd>}
      </div>

      <div className="px-1 pb-1 pt-1">
        {!q.trim() && <div className="px-2 pb-1 pt-1.5 text-caption text-ink-faint">Suggestions</div>}
        {loading ? (
          <ul aria-label="Loading" className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => <li key={i} className="lg-skeleton h-8" />)}
          </ul>
        ) : results.length === 0 ? (
          <div role="status" className="px-3 py-6 text-center">
            <div className="text-body text-ink">No match for “{q}”</div>
            <div className="mt-1 text-caption text-ink-muted">Try a city (Lisbon), a country, an IANA name (America/Bogota), or an offset (+9:30).</div>
          </div>
        ) : (
          <ul id="lg-search-list" role="listbox" ref={listRef} aria-label="Results" className="lg-scroll max-h-[288px]">
            {results.map((r, i) => {
              const added = isAdded(r.city);
              const off = offsetMinutes(r.city.zone, now);
              return (
                <li
                  key={r.city.id + r.city.zone}
                  id={`lg-opt-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={added || undefined}
                  onPointerMove={() => !added && setActive(i)}
                  onClick={() => pick(r)}
                  className={cx('flex h-10 items-center gap-3 rounded-md px-2.5', added ? 'opacity-50' : i === active ? 'bg-field' : '')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium text-ink">{r.city.name}</div>
                    <div className="truncate text-caption text-ink-muted">{describeMatch(r, now)}{r.match !== 'zone' && <span className="text-ink-faint"> · {r.city.zone}</span>}</div>
                  </div>
                  {added ? (
                    <span className="flex items-center gap-1 text-caption text-ink-muted"><Check size={12} aria-hidden /> Added</span>
                  ) : (
                    <div className="tnum text-right">
                      <div className="text-body text-ink">{formatTimeString(r.city.zone, now, { hour12 })}</div>
                      <div className="text-caption text-ink-faint">{formatOffset(off)}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-caption text-ink-faint">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to move</span>
        <span><Kbd>Enter</Kbd> to add</span>
        <span className="ml-auto">Times from your system’s tz database</span>
      </div>
    </Dialog>
  );
}
