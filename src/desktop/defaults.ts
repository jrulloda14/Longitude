import { initialState, type AppState } from '../state/store';
import type { Platform } from '../platform';

/** Platform defaults only seed missing data. Saved preferences remain authoritative. */
export function nativeInitialState(os: Platform['os'], overrides?: Partial<AppState>): AppState {
  const state = initialState(overrides);
  if (os === 'macos' && overrides?.settings === undefined) {
    state.settings.globalShortcut = 'Alt+Super+T';
  }
  return state;
}
