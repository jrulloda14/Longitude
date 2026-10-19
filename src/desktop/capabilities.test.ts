import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (file: string) => JSON.parse(readFileSync(`src-tauri/${file}`, 'utf8'));

describe('native permission and offline boundaries', () => {
  it('limits both windows to events, dragging and fixed native commands', () => {
    const c = read('capabilities/desktop.json');
    expect(c.windows).toEqual(['main', 'widget']);
    expect([...c.permissions].sort()).toEqual([
      'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-start-dragging',
      'allow-longitude-snapshot', 'allow-longitude-apply-state', 'allow-longitude-window',
      'allow-longitude-environment', 'allow-longitude-quit-ready',
    ].sort());
  });
  it('keeps hydration and raw conditional writes restricted to main', () => {
    const c = read('capabilities/configuration.json');
    expect(c.windows).toEqual(['main']);
    expect([...c.permissions].sort()).toEqual([
      'allow-longitude-read-configuration', 'allow-longitude-commit-configuration', 'allow-longitude-initialize',
    ].sort());
  });
  it('does not grant remote origins, wildcard windows or generic OS plugins', () => {
    for (const file of ['desktop', 'configuration', 'sharing']) {
      const c = read(`capabilities/${file}.json`);
      expect(c.remote).toBeUndefined();
      expect(c.windows.every((w: string) => ['main', 'widget'].includes(w))).toBe(true);
      expect(c.permissions.every((p: unknown) => typeof p === 'string' && !/^(fs|shell|http|notification|global-shortcut|autostart|dialog|clipboard-manager):/.test(p))).toBe(true);
    }
  });
  it('restricts calendar and text-only clipboard operations to main, without arbitrary filesystem access', () => {
    const c = read('capabilities/sharing.json');
    expect(c.windows).toEqual(['main']);
    expect(c.permissions).toEqual(['allow-longitude-copy-text', 'allow-longitude-save-calendar']);
  });
  it('restricts production resources and connections to local assets and IPC', () => {
    const csp = read('tauri.conf.json').app.security.csp as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval|https:|\*/);
    const connect = csp.split(';').find(d => d.trim().startsWith('connect-src'))!.trim().split(/\s+/).slice(1);
    expect(connect).toEqual(['ipc:', 'http://ipc.localhost']);
  });
});
