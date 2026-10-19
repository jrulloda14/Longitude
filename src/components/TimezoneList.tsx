/**
 * TimezoneList — ordered rows with reorder (drag the grip, or Alt+↑/↓),
 * a context menu (right-click, ⋯, Shift+F10) and the working-hours editor.
 */
import { Anchor, ArrowDown, ArrowUp, Clock, Copy, Star, Trash2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { WorkingHours, SleepHours, validateHours, workIntervals, workSleepConflict } from '../lib/schedule';
import { Instant, TimeFormat, formatTimeString } from '../lib/time';
import { Button, ContextMenu, Dialog, MenuItem, cx } from '../primitives';
import type { Location } from '../state/store';
import { describeTransition } from './DstNotice';
import { TimezoneRow } from './TimezoneRow';

export interface TimezoneListProps {
  locations: Location[];
  at: Instant;
  referenceId: string | null;
  format: TimeFormat;
  onReorder(id: string, toIndex: number): void;
  onSetReference(id: string): void;
  onRemove(id: string): void;
  onUpdate(id: string, patch: Partial<Location>): void;
  onCopy(text: string): void;
  /** container used to clamp the context menu */
  containerRef: React.RefObject<HTMLElement>;
  /** narrow layout: rows drop the day strip */
  dense?: boolean;
}

export function TimezoneList({ locations, at, referenceId, format, onReorder, onSetReference, onRemove, onUpdate, onCopy, containerRef, dense }: TimezoneListProps) {
  const ref = locations.find((l) => l.id === referenceId) ?? locations[0];
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const items = (loc: Location, i: number): MenuItem[] => [
    { id: 'ref', label: 'Set as reference', icon: <Anchor size={13} />, disabled: loc.id === ref?.id, onSelect: () => onSetReference(loc.id) },
    { id: 'hours', label: 'Working hours…', icon: <Clock size={13} />, onSelect: () => setEditing(loc.id) },
    { id: 'favorite', label: loc.favorite !== false ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={13} />, onSelect: () => onUpdate(loc.id, { favorite: loc.favorite === false }) },
    { id: 'copy', label: 'Copy local time', icon: <Copy size={13} />, onSelect: () => onCopy(`${loc.name} — ${formatTimeString(loc.zone, at, format)}`) },
    { id: 'up', label: 'Move up', icon: <ArrowUp size={13} />, shortcut: 'Alt+↑', disabled: i === 0, separatorBefore: true, onSelect: () => onReorder(loc.id, i - 1) },
    { id: 'down', label: 'Move down', icon: <ArrowDown size={13} />, shortcut: 'Alt+↓', disabled: i === locations.length - 1, onSelect: () => onReorder(loc.id, i + 1) },
    { id: 'remove', label: 'Remove', icon: <Trash2 size={13} />, shortcut: 'Del', danger: true, separatorBefore: true, onSelect: () => onRemove(loc.id) },
  ];

  const menuLoc = menu ? locations.find((l) => l.id === menu.id) : null;
  const editLoc = editing ? locations.find((l) => l.id === editing) : null;

  return (
    <>
      <div role="list" aria-label="Locations" className="flex flex-col">
        {locations.map((loc, i) => (
          <div key={loc.id} className="lg-row-in" ref={(el) => (rowRefs.current[loc.id] = el)}>
            <TimezoneRow
              location={loc}
              at={at}
              referenceZone={ref?.zone ?? loc.zone}
              isReference={loc.id === ref?.id}
              hour12={format.hour12}
              showStrip={!dense}
              dstNote={describeTransition(loc.zone, loc.name, at, format, 21)}
              dragging={dragId === loc.id}
              dropIndicator={drop?.id === loc.id && dragId !== loc.id ? drop.pos : null}
              onMenu={(e) => setMenu({ id: loc.id, x: e.clientX, y: e.clientY })}
              onSetReference={() => onSetReference(loc.id)}
              dragHandleProps={{
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  setDragId(loc.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', loc.id);
                  const row = rowRefs.current[loc.id];
                  if (row) e.dataTransfer.setDragImage(row, 20, 26);
                },
                onDragEnd: () => { setDragId(null); setDrop(null); },
              } as React.HTMLAttributes<HTMLElement>}
              rowProps={{
                onDragOver: (e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDrop({ id: loc.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (!dragId || !drop) return;
                  const from = locations.findIndex((l) => l.id === dragId);
                  let to = locations.findIndex((l) => l.id === drop.id) + (drop.pos === 'after' ? 1 : 0);
                  if (from < to) to -= 1;
                  onReorder(dragId, to);
                  setDragId(null);
                  setDrop(null);
                },
                onKeyDown: (e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    e.preventDefault();
                    onReorder(loc.id, i + (e.key === 'ArrowUp' ? -1 : 1));
                    requestAnimationFrame(() => rowRefs.current[loc.id]?.querySelector<HTMLElement>('[role=listitem]')?.focus());
                  } else if (e.key === 'Delete') {
                    onRemove(loc.id);
                  } else if (e.key === 'Enter') {
                    onSetReference(loc.id);
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const next = locations[i + (e.key === 'ArrowDown' ? 1 : -1)];
                    if (next) rowRefs.current[next.id]?.querySelector<HTMLElement>('[role=listitem]')?.focus();
                  }
                },
              }}
            />
          </div>
        ))}
      </div>

      <ContextMenu
        at={menu ? { x: menu.x, y: menu.y } : null}
        items={menuLoc ? items(menuLoc, locations.indexOf(menuLoc)) : []}
        onClose={() => setMenu(null)}
        container={containerRef}
        label={menuLoc ? `${menuLoc.name} actions` : 'Actions'}
      />

      {editLoc && (
        <WorkingHoursEditor
          location={editLoc}
          onClose={() => setEditing(null)}
          onSave={(work, sleep, note) => { onUpdate(editLoc.id, { work, sleep, note: note || undefined }); setEditing(null); }}
          format={format}
        />
      )}
    </>
  );
}

// ── WorkingHoursEditor ─────────────────────────────────────────────────────

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesLabel(m: number, hour12: boolean) {
  const h = Math.floor(m / 60) % 24;
  const mm = String(m % 60).padStart(2, '0');
  return hour12 ? `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${mm}`;
}

export function TimeSelect({ value, onChange, label, hour12 }: { value: number; onChange(v: number): void; label: string; hour12: boolean }) {
  return (
    <select aria-label={label} className="lg-select tnum text-body" value={value} onChange={(e) => onChange(+e.target.value)}>
      {[...new Set([...Array.from({ length: 96 }, (_, i) => i * 15), value, ...(label.toLowerCase().includes('ends') ? [1440] : [])])].sort((a, b) => a - b).map((m) => (
        <option key={m} value={m}>{m === 1440 ? 'Midnight (end of day)' : minutesLabel(m, hour12)}</option>
      ))}
    </select>
  );
}

export function WorkingHoursEditor({ location, onClose, onSave, format }: {
  location: Location;
  onClose(): void;
  onSave(work: WorkingHours, sleep: SleepHours, note: string): void;
  format: TimeFormat;
}) {
  const [work, setWork] = useState(location.work);
  const [sleep, setSleep] = useState(location.sleep);
  const [note, setNote] = useState(location.note ?? '');
  let validation = '';
  try { validateHours(work, sleep); } catch (e) { validation = (e as Error).message; }
  const invalid = !!validation;
  const intervals = workIntervals(work);
  const setInterval = (index: number, field: 'start' | 'end', value: number) => {
    const next = intervals.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setWork({ ...work, ...next[0], ...(work.intervals || next.length > 1 ? { intervals: next } : {}) });
  };
  return (
    <Dialog open onClose={onClose} title={`Working hours — ${location.name}`} width={360} className="lg-scroll max-h-[calc(100vh-80px)] !overflow-y-auto">
      <div className="p-4">
        <h3 className="text-title font-semibold">{location.name}</h3>
        <p className="mt-0.5 text-caption text-ink-muted">Hours are local to {location.name}. Used only to judge meeting times — not anyone's calendar.</p>

        <label className="mt-4 block text-label font-medium text-ink-muted" htmlFor="lg-note">Label (optional)</label>
        <input id="lg-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Priya, Design team"
          className="mt-1 h-7 w-full rounded-md border border-line bg-field px-2 text-body outline-none placeholder:text-ink-faint focus:border-line-strong" />

        <div className="mt-4 text-label font-medium text-ink-muted">Working hours</div>
        {intervals.map((item, index) => <div key={index} className="mt-1 flex items-center gap-2">
          <TimeSelect label={index ? `Work ${index + 1} starts` : 'Work starts'} value={item.start} onChange={(v) => setInterval(index, 'start', v)} hour12={format.hour12} />
          <span className="text-ink-faint">to</span>
          <TimeSelect label={index ? `Work ${index + 1} ends` : 'Work ends'} value={item.end} onChange={(v) => setInterval(index, 'end', v)} hour12={format.hour12} />
          {intervals.length > 1 && <button aria-label={`Remove work interval ${index + 1}`} className="text-caption text-ink-muted" onClick={() => {
            const next = intervals.filter((_, i) => i !== index); setWork({ ...work, ...next[0], intervals: next });
          }}>×</button>}
        </div>)}
        <button className="mt-1 text-caption text-ink-muted underline decoration-line-strong underline-offset-2" disabled={intervals.length >= 8} onClick={() => setWork({ ...work, intervals: [...intervals, { start: 1080, end: 1200 }] })}>Add work interval</button>
        {intervals.some(i => i.end < i.start) && <p className="mt-1 text-caption text-ink-faint">Overnight shifts belong to the day they start.</p>}
        <div role="group" aria-label="Working days" className="mt-2 flex gap-1">
          {DAY_LETTERS.map((d, i) => {
            const on = work.days.includes(i);
            return (
              <button key={i} aria-pressed={on} aria-label={DAY_NAMES[i]} title={DAY_NAMES[i]}
                onClick={() => setWork({ ...work, days: on ? work.days.filter((x) => x !== i) : [...work.days, i].sort() })}
                className={cx('h-7 w-7 rounded-md text-label font-medium', on ? 'bg-work-band text-ink shadow-[inset_0_0_0_1px_var(--work)]' : 'bg-field text-ink-faint hover:text-ink')}>
                {d}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-label font-medium text-ink-muted">Usually asleep</div>
        <div className="mt-1 flex items-center gap-2">
          <TimeSelect label="Sleep starts" value={sleep.start} onChange={(v) => setSleep({ ...sleep, start: v })} hour12={format.hour12} />
          <span className="text-ink-faint">to</span>
          <TimeSelect label="Sleep ends" value={sleep.end} onChange={(v) => setSleep({ ...sleep, end: v })} hour12={format.hour12} />
        </div>
        {!work.days.length && <p className="mt-2 text-caption text-ink-faint">No working days selected. This location has no working hours.</p>}
        {!invalid && workSleepConflict(work, sleep) && <p role="status" className="mt-2 text-caption text-edge">Work overlaps sleeping hours. Sleeping hours take priority; adjust them for overnight shifts.</p>}
        {invalid && <p role="alert" className="mt-3 text-caption text-danger">{validation}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={invalid} onClick={() => onSave(work, sleep, note.trim())}>Save</Button>
      </div>
    </Dialog>
  );
}
