/**
 * DstNotice — calm, inline note about UTC-offset changes.
 * Never red, never modal. Text carries the meaning; the glyph is decoration.
 */
import React from 'react';
import { cx } from '../primitives';

export function DstNotice({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'quiet'; className?: string }) {
  return (
    <p role="note" className={cx('flex max-w-[340px] items-start gap-2 rounded-md px-2.5 py-1.5 text-caption', tone === 'info' ? 'bg-edge-band text-ink' : 'text-ink-muted', className)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="mt-px shrink-0 text-edge">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3.2V6l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export { describeTransition, recurringShifts } from '../lib/meeting-dst';
export type { RecurringShift } from '../lib/meeting-dst';
