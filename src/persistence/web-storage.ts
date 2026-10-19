import type { ConfigurationStorage } from './storage';

export function createWebStorage(): ConfigurationStorage {
  return {
    async read(key) { return localStorage.getItem(key); },
    async compareAndSwap(key, expected, next) {
      if (key !== 'longitude.configuration') throw new Error('Legacy storage is read-only.');
      if (!navigator.locks) throw new Error('Safe local storage locking is unavailable in this browser.');
      return navigator.locks.request('longitude-configuration', () => {
        if (localStorage.getItem(key) !== expected) return false;
        // A single-key Web Storage replacement is atomic on failure. Backup and
        // recovery bytes travel in this same replacement, not separate writes.
        localStorage.setItem(key, next);
        return true;
      });
    },
  };
}
