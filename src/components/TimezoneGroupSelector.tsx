/**
 * TimezoneGroupSelector — the group name as a quiet dropdown.
 * Switch (Ctrl+1…9), create, rename inline, duplicate, delete.
 */
import { ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Popover, cx } from '../primitives';

export interface GroupSummary {
  id: string;
  name: string;
  count: number;
}

export interface TimezoneGroupSelectorProps {
  groups: GroupSummary[];
  activeId: string;
  onSwitch(id: string): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}

export function TimezoneGroupSelector({ groups, activeId, onSwitch, onCreate, onRename, onDuplicate, onDelete }: TimezoneGroupSelectorProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  useEffect(() => { if (editing) requestAnimationFrame(() => inputRef.current?.select()); }, [editing]);

  const commit = () => {
    const name = draft.trim();
    if (name) {
      if (editing === 'new') onCreate(name);
      else if (editing) onRename(editing, name);
    }
    setEditing(null);
  };

  return (
    <div className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={e => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault(); setOpen(true);
          const last = e.key === 'ArrowUp';
          requestAnimationFrame(() => {
            const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]');
            items?.[last ? items.length - 1 : 0]?.focus();
          });
        }}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-title font-semibold text-ink hover:bg-field"
      >
        {active.name}
        <span className="tnum text-label font-normal text-ink-faint">{active.count}</span>
        <ChevronDown size={14} className="text-ink-muted" aria-hidden />
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setEditing(null); }} label="Groups" className="left-0 top-8 w-[248px]">
        <div ref={menuRef} role="menu" aria-label="Groups" onKeyDown={e => {
          if ((e.target as Element).tagName === 'INPUT' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>
          {groups.map((g, i) => (
            <div key={g.id} className="group flex items-center rounded-md hover:bg-field">
              {editing === g.id ? (
                <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} aria-label="Group name"
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                  className="mx-1 h-6 flex-1 rounded-sm border border-line-strong bg-ground px-1.5 text-body outline-none" />
              ) : (
                <button role="menuitemradio" aria-checked={g.id === activeId} onClick={() => { onSwitch(g.id); setOpen(false); }}
                  className="focus-inset flex h-7 flex-1 items-center gap-2 rounded-md px-2 text-left text-body">
                  <span className={cx('h-1.5 w-1.5 rounded-full', g.id === activeId ? 'bg-accent' : 'bg-transparent')} />
                  <span className="flex-1 truncate">{g.name}</span>
                  <span className="tnum text-caption text-ink-faint group-hover:hidden">{i < 9 ? `Ctrl+${i + 1}` : ''}</span>
                </button>
              )}
              {editing !== g.id && (
                <span className="hidden pr-1 group-hover:flex group-focus-within:flex">
                  <button aria-label={`Rename ${g.name}`} onClick={() => { setDraft(g.name); setEditing(g.id); }} className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint hover:text-ink"><Pencil size={12} /></button>
                  <button aria-label={`Duplicate ${g.name}`} onClick={() => { onDuplicate(g.id); setOpen(false); }} className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint hover:text-ink"><Copy size={12} /></button>
                  <button aria-label={`Delete ${g.name}`} disabled={groups.length <= 1} onClick={() => onDelete(g.id)} className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint hover:text-danger disabled:opacity-30"><Trash2 size={12} /></button>
                </span>
              )}
            </div>
          ))}
          <div className="mx-1 my-1 h-px bg-line" />
          {editing === 'new' ? (
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} placeholder="Group name" aria-label="New group name"
              onKeyDown={(e) => { if (e.key === 'Enter') { commit(); setOpen(false); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
              className="m-1 h-6 w-[calc(100%-8px)] rounded-sm border border-line-strong bg-ground px-1.5 text-body outline-none placeholder:text-ink-faint" />
          ) : (
            <button role="menuitem" onClick={() => { setDraft(''); setEditing('new'); }} className="focus-inset flex h-7 w-full items-center gap-2 rounded-md px-2 text-body text-ink-muted hover:bg-field hover:text-ink">
              <Plus size={13} aria-hidden /> New group
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}
