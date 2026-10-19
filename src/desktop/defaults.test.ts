import { describe, expect, it } from 'vitest';
import { nativeInitialState } from './defaults';
import { DEFAULT_SETTINGS } from '../state/store';

describe('native defaults without saved preference replacement', () => {
  it('uses Mac modifiers for a new Mac profile only', () => {
    expect(nativeInitialState('macos').settings.globalShortcut).toBe('Alt+Super+T');
    expect(nativeInitialState('windows').settings.globalShortcut).toBe('Ctrl+Alt+T');
    expect(DEFAULT_SETTINGS.globalShortcut).toBe('Ctrl+Alt+T');
  });
  it('preserves explicit/imported settings on Mac', () => {
    const settings = { ...DEFAULT_SETTINGS, globalShortcut: 'Ctrl+Shift+Y', launchAtSignIn: true };
    expect(nativeInitialState('macos', { settings }).settings).toEqual(settings);
  });
  it('does not mutate defaults across window initialization', () => {
    nativeInitialState('macos').settings.globalShortcut = 'Alt+Super+Y';
    expect(nativeInitialState('macos').settings.globalShortcut).toBe('Alt+Super+T');
    expect(nativeInitialState('windows').settings.globalShortcut).toBe('Ctrl+Alt+T');
  });
});
