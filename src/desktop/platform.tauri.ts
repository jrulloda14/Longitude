import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createTauriStorage } from '../persistence/tauri-storage';
import { webPlatform, type Platform } from '../platform';
import { nativeSharing } from './sharing';
import type { DesktopPort, DesktopSnapshot } from './state-client';

export async function createNativePlatform(): Promise<Platform> {
  const environment = await invoke<{ os: Platform['os'] }>('longitude_environment');
  const label = getCurrentWindow().label === 'widget' ? 'widget' : 'main';
  const control = (action: string) => invoke<void>('longitude_window', { action });
  const report = (operation: Promise<unknown>) => { void operation.catch(error => window.dispatchEvent(new CustomEvent('longitude-native-error', { detail: String(error) }))); };
  const desktop: DesktopPort = {
    label, control,
    snapshot: () => invoke('longitude_snapshot'),
    initialize: (state, writable) => invoke('longitude_initialize', { state, writable }),
    apply: (revision, state, origin, requestId) => invoke('longitude_apply_state', { revision, state, origin, requestId }),
    listen: async callback => listen<DesktopSnapshot>('longitude-state', event => callback(event.payload)),
    beforeQuit: async flush => listen<number>('longitude-quit-request', event => {
      void flush().then(() => invoke('longitude_quit_ready', { generation: event.payload, success: true, message: '' }), error => invoke('longitude_quit_ready', { generation: event.payload, success: false, message: String(error) })).catch(error => window.dispatchEvent(new CustomEvent('longitude-native-error', { detail: String(error) })));
    }),
    onError: async callback => {
      const handler = (e: Event) => callback((e as CustomEvent<string>).detail); window.addEventListener('longitude-native-error', handler);
      const unlisten = await listen<string>('longitude-error', event => callback(event.payload));
      return () => { window.removeEventListener('longitude-native-error', handler); unlisten(); };
    },
  };
  return {
    ...webPlatform, ...nativeSharing(invoke), kind: 'tauri', os: environment.os, desktop, storage: createTauriStorage(invoke), autostart: { supported: true },
    window: {
      minimize: () => report(control('minimize')), toggleMaximize: () => report(control('maximize')), close: () => report(control('close')),
      setAlwaysOnTop: () => { if (label === 'widget') report(control('widget-pin')); },
      setMode: () => {}, // visibility is controlled independently through the state bridge
    },
  };
}
