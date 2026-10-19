import type { ConfigurationStorage } from './storage';

export type ConfigurationInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;
/** Narrow Tauri 2 command adapter. The native host must implement atomic CAS
 * with a fixed app-config file, flush + atomic replace, and process locking.
 * No filesystem path or generic filesystem permission crosses this boundary.
 * The matching native host is implemented and tested in Milestone 5A.
 */
export function createTauriStorage(invoke: ConfigurationInvoke): ConfigurationStorage {
  const check = (key: string) => { if (key !== 'longitude.configuration' && key !== 'longitude.v1') throw new Error('Unsupported configuration key.'); };
  return {
    async read(key) { check(key); return invoke<string | null>('longitude_read_configuration', { key }); },
    async compareAndSwap(key, expected, next) { check(key); if (key !== 'longitude.configuration') throw new Error('Legacy storage is read-only.'); return invoke<boolean>('longitude_commit_configuration', { key, expected, next }); },
  };
}
