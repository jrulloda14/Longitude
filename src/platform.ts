/**
 * Portable platform port with a browser preview adapter. Milestone 5A's
 * desktop/platform.tauri.ts implements native state/window/storage integration.
 * Rust owns tray, shortcuts, autostart and conditional filesystem writes.
 * Native sharing is implemented through narrow main-window app commands.
 */
import type { ConfigurationStorage } from './persistence/storage';
import { createWebStorage } from './persistence/web-storage';
import type { DesktopPort } from './desktop/state-client';

export type SaveResult = { status: 'saved' } | { status: 'downloaded' } | { status: 'cancelled' } | { status: 'error'; message: string };

export interface Platform {
  readonly kind: 'web-prototype' | 'tauri';
  readonly os: 'windows' | 'macos' | 'linux';
  readonly desktop?: DesktopPort;
  copyText(text: string): Promise<boolean>;
  saveFile(name: string, contents: string, mime: string): Promise<SaveResult>;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setAlwaysOnTop(on: boolean): void;
    setMode(mode: 'full' | 'compact'): void;
  };
  storage: ConfigurationStorage;
  /** Not available in the prototype — UI shows these controls disabled. */
  autostart: { supported: boolean };
}

async function webCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const ta = document.createElement('textarea');
    try {
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      return ok;
    } catch {
      return false;
    } finally { ta.remove(); previous?.focus(); }
  }
}

function webSave(name: string, contents: string, mime: string): Promise<SaveResult> {
  try {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return Promise.resolve({ status: 'downloaded' });
  } catch {
    return Promise.resolve({ status: 'error', message: 'Could not start the calendar download.' });
  }
}

const noop = () => {};

export const webPlatform: Platform = {
  kind: 'web-prototype',
  os: /Mac/i.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? 'macos' : 'windows',
  copyText: webCopy,
  saveFile: webSave,
  window: { minimize: noop, toggleMaximize: noop, close: noop, setAlwaysOnTop: noop, setMode: noop },
  storage: createWebStorage(),
  autostart: { supported: false },
};
