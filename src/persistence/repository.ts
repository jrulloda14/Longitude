import type { ConfigurationStorage } from './storage';
import { type DurableConfiguration, decodeConfiguration, encodeConfiguration, FutureSchemaError } from './schema';

export interface PersistenceStatus { phase: 'disabled' | 'loading' | 'saved' | 'saving' | 'recovered' | 'error' | 'blocked'; message: string }
export const CONFIGURATION_KEY = 'longitude.configuration';
export const LEGACY_KEY = 'longitude.v1';
const MAX_RECORD_CHARS = 8 * 1024 * 1024;
interface RecordFile { format: 1; current: string; previous: string | null; recovery: string | null }
export class ConfigurationRepository {
  private expected: string | null = null;
  private file: RecordFile = { format: 1, current: '', previous: null, recovery: null };
  private revision = 0;
  private saved = '';
  private pending: DurableConfiguration | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writable = false;
  private failed = false;
  private notice = '';
  private loading: Promise<DurableConfiguration> | null = null;
  private readError = false;
  constructor(private storage: ConfigurationStorage, private defaults: DurableConfiguration, private notify: (status: PersistenceStatus) => void = () => {}, private debounceMs = 0) {}
  get canSave() { return this.writable; }
  get needsReadRetry() { return this.readError; }
  subscribe(notify: (status: PersistenceStatus) => void) { this.notify = notify; }
  async load(): Promise<DurableConfiguration> {
    if (this.loading) return this.loading;
    this.loading = this.readLoad();
    try { return await this.loading; } finally { this.loading = null; }
  }
  private async readLoad(): Promise<DurableConfiguration> {
    this.notice = ''; this.readError = false;
    this.notify({ phase: 'loading', message: '' }); this.writable = false;
    try {
      const raw = await this.storage.read(CONFIGURATION_KEY); this.expected = raw;
      let current: string | null = null, previous: string | null = null, recovery: string | null = null;
      if (raw !== null) {
        try {
          if (raw.length > MAX_RECORD_CHARS) throw new Error('Saved file exceeds the storage limit.');
          const record = JSON.parse(raw);
          if (typeof record?.format === 'number' && record.format > 1) throw new FutureSchemaError('Saved storage uses a newer format. Saving is paused to protect it.');
          if (record?.format !== 1 || typeof record.current !== 'string') throw new Error('Invalid storage record.');
          current = record.current;
          previous = typeof record.previous === 'string' ? record.previous : null;
          recovery = typeof record.recovery === 'string' ? record.recovery : null;
          if (!(record.previous === null || typeof record.previous === 'string') || !(record.recovery === null || typeof record.recovery === 'string')) {
            recovery = raw; this.notice = 'Saved metadata was repaired. Valid preferences and original recovery data are preserved.';
          }
        } catch (e) { if (e instanceof FutureSchemaError) throw e; recovery = raw; this.notice = 'Saved data was unreadable. Defaults restored; original data is preserved in the recovery copy.'; }
      } else current = await this.storage.read(LEGACY_KEY);
      let decoded: ReturnType<typeof decodeConfiguration> | null = null;
      if (current !== null) {
        try { decoded = decodeConfiguration(current, this.defaults); }
        catch (e) {
          if (e instanceof FutureSchemaError) throw e;
          recovery = raw ?? current;
          if (previous) {
            try { decoded = decodeConfiguration(previous, this.defaults); }
            catch (error) { if (error instanceof FutureSchemaError) throw error; }
          }
          this.notice = 'Saved data was damaged. Recovered the previous valid configuration or defaults; original bytes are preserved.';
        }
      }
      if (decoded?.issues.length) { recovery = raw ?? current; this.notice = `Recovered saved configuration (${decoded.issues.slice(0, 4).join(', ')}). Original bytes are preserved.`; }
      const data = decoded?.data ?? structuredClone(this.defaults);
      this.revision = decoded?.revision ?? 0;
      this.file = { format: 1, current: decoded ? encodeConfiguration(data, this.revision) : '', previous, recovery };
      this.saved = JSON.stringify(data); this.writable = true; this.failed = false;
      // Missing/migrated/repaired records are committed only AFTER hydration.
      if (raw === null || this.notice || decoded?.migrated) this.saved = '';
      this.notify({ phase: this.notice ? 'recovered' : 'saved', message: this.notice });
      return data;
    } catch (e) {
      this.readError = !(e instanceof FutureSchemaError);
      this.notify({ phase: e instanceof FutureSchemaError ? 'blocked' : 'error', message: e instanceof Error ? e.message : 'Could not load saved settings.' });
      return structuredClone(this.defaults);
    }
  }
  update(data: DurableConfiguration) {
    if (!this.writable) return;
    this.pending = structuredClone(data);
    clearTimeout(this.timer);
    if (!this.writable || this.failed) return;
    if (this.debounceMs > 0) this.timer = setTimeout(() => { void this.flush(); }, this.debounceMs);
    else queueMicrotask(() => { void this.flush(); });
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) { await this.running; if (this.pending && !this.failed) await this.flush(); return; }
    if (!this.writable || this.failed) return;
    this.running = this.drain();
    try { await this.running; } finally { this.running = null; }
  }
  private async drain() {
    while (this.pending && this.writable && !this.failed) {
      const data = this.pending; this.pending = null;
      const payload = JSON.stringify(data); if (payload === this.saved) continue;
      this.notify({ phase: 'saving', message: this.notice });
      try {
        if (this.revision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Saved revision limit reached. Original storage is unchanged.');
        const current = encodeConfiguration(data, this.revision + 1, this.defaults);
        const next: RecordFile = { format: 1, current, previous: this.file.current || this.file.previous, recovery: this.file.recovery };
        const raw = JSON.stringify(next); if (raw.length > MAX_RECORD_CHARS) throw new Error('Recovery copy exceeds safe storage size. Saving paused; original storage is unchanged.');
        const ok = await this.storage.compareAndSwap(CONFIGURATION_KEY, this.expected, raw);
        if (!ok) { this.writable = false; throw new Error('Saved settings changed in another window. Reload before saving to avoid overwriting them.'); }
        this.file = next; this.expected = raw; this.revision++; this.saved = payload;
        this.notify({ phase: this.notice ? 'recovered' : 'saved', message: this.notice });
      } catch (e) {
        this.pending ??= data; this.failed = true;
        this.notify({ phase: this.writable ? 'error' : 'blocked', message: e instanceof Error ? e.message : 'Could not save settings. Changes remain in memory.' });
      }
    }
  }
  async retry() { this.failed = false; await this.flush(); }
  close() { clearTimeout(this.timer); this.notify = () => {}; void this.flush(); }
}
