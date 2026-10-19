/**
 * TitleBar — custom, draggable (data-tauri-drag-region), with native-looking
 * caption buttons. Windows: buttons right, 46×32 hit areas, red close hover.
 * macOS: traffic lights left (Tauri titleBarStyle "Overlay"), centered tabs.
 */
import { Minus, PictureInPicture2, Square, X } from 'lucide-react';
import React from 'react';
import { IconButton, cx } from '../primitives';

export interface TitleBarProps {
  chrome: 'windows' | 'macos';
  nativeMac?: boolean;
  center?: React.ReactNode;
  /** place the center slot in flow (narrow windows) instead of true-centering it */
  centerInline?: boolean;
  actions?: React.ReactNode;
  onMinimize(): void;
  onMaximize(): void;
  onClose(): void;
  onCompact(): void;
}

export function AppMark({ size = 14 }: { size?: number }) {
  // Original mark: a dial with one meridian cut through it.
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
      <path d="M8 1.4v13.2" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M8 8l3-2" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TitleBar({ chrome, nativeMac, center, centerInline, actions, onMinimize, onMaximize, onClose, onCompact }: TitleBarProps) {
  const mac = chrome === 'macos';
  return (
    <header data-tauri-drag-region className="relative flex h-10 shrink-0 items-center border-b border-line" onDoubleClick={(e) => e.target === e.currentTarget && onMaximize()}>
      {mac && nativeMac ? (
        <div data-tauri-drag-region aria-hidden="true" className="h-full w-[80px] shrink-0" />
      ) : mac ? (
        <div className="flex items-center gap-2 pl-3.5 pr-3" aria-label="Window controls">
          <button aria-label="Close" onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,.25)]" />
          <button aria-label="Minimize" onClick={onMinimize} className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,.25)]" />
          <button aria-label="Zoom" onClick={onMaximize} className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,.25)]" />
        </div>
      ) : (
        <div data-tauri-drag-region className="flex items-center gap-2 pl-3 pr-2">
          <AppMark />
          {!centerInline && <span data-tauri-drag-region className="text-label font-semibold text-ink">Longitude</span>}
        </div>
      )}

      <div data-tauri-drag-region className={cx('flex items-center', centerInline ? 'pl-1' : 'absolute inset-y-0 left-1/2 -translate-x-1/2')}>{center}</div>

      <div data-tauri-drag-region className="ml-auto flex h-full items-center gap-0.5 pr-1">
        {actions}
        <IconButton label="Compact widget" shortcut={mac ? '⇧⌘M' : 'Ctrl+Shift+M'} onClick={onCompact}><PictureInPicture2 size={15} /></IconButton>
        {!mac && (
          <div className="ml-1 flex h-full" aria-label="Window controls">
            {[
              { l: 'Minimize', i: <Minus size={14} strokeWidth={1.25} />, f: onMinimize },
              { l: 'Maximize', i: <Square size={11} strokeWidth={1.25} />, f: onMaximize },
              { l: 'Close', i: <X size={15} strokeWidth={1.25} />, f: onClose },
            ].map((b) => (
              <button key={b.l} aria-label={b.l} title={b.l} onClick={b.f}
                className={cx('flex h-full w-[46px] items-center justify-center text-ink transition-colors duration-100', b.l === 'Close' ? 'hover:bg-win-close hover:text-white' : 'hover:bg-field')}>
                {b.i}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
