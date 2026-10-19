/** Fixed logical keys, never arbitrary native filesystem paths. */
export type StorageKey = 'longitude.configuration' | 'longitude.v1';
export interface ConfigurationStorage {
  read(key: StorageKey): Promise<string | null>;
  /** Atomically compare raw current bytes and replace, or return false. */
  compareAndSwap(key: 'longitude.configuration', expected: string | null, next: string): Promise<boolean>;
}
