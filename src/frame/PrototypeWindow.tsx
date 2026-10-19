/**
 * PrototypeWindow — PROTOTYPE ONLY. Draws a desktop window around the app so
 * the design can be judged in a browser, with a real resize handle (drag the
 * bottom-right corner) to exercise responsive behaviour. In Tauri the OS
 * window replaces this entirely; mount <LongitudeApp/> directly.
 */
import React from 'react';
import { LongitudeApp, LongitudeAppProps } from '../App';
import { DEFAULT_SETTINGS } from '../state/store';

export interface PrototypeWindowProps extends LongitudeAppProps {
  width?: number;
  height?: number;
  theme?: 'dark' | 'light';
  resizable?: boolean;
}

export function PrototypeWindow({ width = 850, height = 560, theme = 'dark', resizable = true, ...app }: PrototypeWindowProps) {
  const initial = { ...app.initial, settings: { ...DEFAULT_SETTINGS, ...(app.initial?.settings ?? {}), theme } };
  return (
    <div
      data-theme={theme}
      className="lg-proto-window"
      style={{
        width, height, minWidth: 380, minHeight: 400, maxWidth: '100%',
        resize: resizable ? 'both' : 'none', overflow: 'hidden', borderRadius: 8,
        boxShadow: 'var(--shadow-window)', background: 'var(--ground)',
      }}
    >
      <LongitudeApp {...app} initial={initial} />
    </div>
  );
}
