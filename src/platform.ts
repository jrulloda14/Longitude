/**
 * Platform adapter — the ONLY module that touches OS/window APIs.
 * The prototype ships a web implementation; production swaps in Tauri.
 *
 * Tauri 2 mapping (see HANDOFF.md §Platform):
 *   copyText        → @tauri-apps/plugin-clipboard-manager  writeText
 *   saveFile        → @tauri-apps/plugin-dialog save() + @tauri-apps/plugin-fs writeTextFile
 *   window.*        → @tauri-apps/api/window getCurrentWindow()
 *   setAlwaysOnTop  → win.setAlwaysOnTop(b)
 *   setMode         → win.setSize(LogicalSize) + setDecorations/setResizable
 *   autostart       → @tauri-apps/plugin-autostart
 *   storage         → @tauri-apps/plugin-store (JSON in app config dir)
 */

export interface Platform {
  readonly kind: 'web-prototype' | 'tauri';
  readonly os: 'windows' | 'macos' | 'linux';
  copyText(text: string): Promise<boolean>;
  saveFile(name: string, contents: string, mime: string): Promise<boolean>;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setAlwaysOnTop(on: boolean): void;
    setMode(mode: 'full' | 'compact'): void;
  };
  storage: {
    load<T>(key: string): T | null;
    save<T>(key: string, value: T): void;
  };
  /** Not available in the prototype — UI shows these controls disabled. */
  autostart: { supported: boolean };
}

async function webCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function webSave(name: string, contents: string, mime: string): Promise<boolean> {
  try {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

const noop = () => {};

export const webPlatform: Platform = {
  kind: 'web-prototype',
  os: /Mac/i.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? 'macos' : 'windows',
  copyText: webCopy,
  saveFile: webSave,
  window: { minimize: noop, toggleMaximize: noop, close: noop, setAlwaysOnTop: noop, setMode: noop },
  storage: {
    load<T>(key: string): T | null {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    save<T>(key: string, value: T) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage unavailable (private window, sandbox) — state stays in memory */
      }
    },
  },
  autostart: { supported: false },
};
