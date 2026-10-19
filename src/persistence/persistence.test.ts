import { describe, it, expect, vi } from 'vitest';
import { initialState, reducer, locationFromCity } from '../state/store';
import { cityById } from '../lib/cities';
import { decodeConfiguration, durable, encodeConfiguration, FutureSchemaError } from './schema';
import { ConfigurationRepository, CONFIGURATION_KEY, LEGACY_KEY, type PersistenceStatus } from './repository';
import type { ConfigurationStorage, StorageKey } from './storage';
import { createTauriStorage } from './tauri-storage';
const defaults = () => durable(initialState({ groups: [{ id: 'group', name: 'Team', referenceId: 'p', locations: [{ ...locationFromCity(cityById('manila')!), id: 'p' }] }], activeGroupId: 'group' }));
const envelope = (data = defaults(), version: unknown = 1) => JSON.stringify({ version, revision: 3, data });
const record = (current: string, previous: string | null = null, recovery: string | null = null) => JSON.stringify({ format: 1, current, previous, recovery });
class MemoryStorage implements ConfigurationStorage {
  values = new Map<StorageKey, string>(); reads = 0; writes = 0; failRead = false; failWrite = false;
  delay: (() => Promise<void>) | null = null;
  async read(key: StorageKey) { this.reads++; if (this.failRead) throw new Error('Read failed'); return this.values.get(key) ?? null; }
  async compareAndSwap(key: StorageKey, expected: string | null, next: string) {
    if (this.delay) await this.delay();
    if (this.failWrite) throw new Error('Disk full');
    if ((this.values.get(key) ?? null) !== expected) return false;
    this.values.set(key, next); this.writes++; return true;
  }
}
const setup = () => { const storage = new MemoryStorage(); const statuses: PersistenceStatus[] = []; const repo = new ConfigurationRepository(storage, defaults(), s => statuses.push(s), 100000); return { storage, statuses, repo }; };
const saved = (s: MemoryStorage) => decodeConfiguration(JSON.parse(s.values.get(CONFIGURATION_KEY)!).current, defaults()).data;

describe('versioned schema and deterministic migration', () => {
  it('roundtrips durable configuration without live/session state', () => {
    const state = initialState(defaults()); state.selected = Date.now(); state.mode = 'compact'; state.view = 'planner';
    const data = durable(state), raw = encodeConfiguration(data, 1);
    expect(decodeConfiguration(raw, data).data).toEqual(JSON.parse(JSON.stringify(data)));
    expect(raw).not.toMatch(/selected|"mode"|"view"|searchRequest/);
  });
  it('retains ordering, labels, favorite flags, reference, split/overnight schedules and sleep', () => {
    const d = defaults(); const a = d.groups[0].locations[0]; a.favorite = false; a.note = 'Priya';
    a.work = { start: 1320, end: 360, days: [0, 4, 5], intervals: [{ start: 1320, end: 360 }, { start: 780, end: 900 }] }; a.sleep = { start: 480, end: 960 };
    d.groups[0].locations.push({ ...a, id: 'q', name: 'Singapore', favorite: true }); d.groups[0].referenceId = 'q';
    expect(decodeConfiguration(envelope(d), defaults()).data).toEqual(d);
  });
  it('migrates unversioned state deterministically and defaults missing deep settings', () => {
    const d = defaults(), raw = JSON.stringify({ ...d, settings: { theme: 'light', defaultWork: { days: [0, 4], start: 600 } }, selected: 123, mode: 'compact' });
    const a = decodeConfiguration(raw, d), b = decodeConfiguration(raw, d);
    expect(a).toEqual(b); expect(a.migrated).toBe(true); expect(a.data.settings.theme).toBe('light');
    expect(a.data.settings.hour12).toBe(true); expect(a.data.settings.defaultWork).toEqual({ start: 600, end: 1050, days: [0, 4] });
  });
  it('repairs duplicate IDs and invalid active/reference deterministically', () => {
    const d = defaults(); d.groups[0].locations.push({ ...d.groups[0].locations[0] }); d.groups.push(structuredClone(d.groups[0]));
    d.activeGroupId = 'missing'; d.groups[0].referenceId = 'missing';
    const a = decodeConfiguration(envelope(d), defaults()), b = decodeConfiguration(envelope(d), defaults());
    expect(a).toEqual(b); expect(new Set(a.data.groups.map(g => g.id)).size).toBe(2);
    const ids = a.data.groups.flatMap(g => g.locations.map(l => l.id)); expect(new Set(ids).size).toBe(4);
    expect(a.data.activeGroupId).toBe(a.data.groups[0].id); expect(a.data.groups[0].referenceId).toBe(a.data.groups[0].locations[0].id);
  });
  it('retains two different cities sharing a canonical timezone', () => {
    const d = defaults(); d.groups[0].locations.push({ ...d.groups[0].locations[0], id: 'q', name: 'Another city' });
    expect(decodeConfiguration(envelope(d), defaults()).data.groups[0].locations).toHaveLength(2);
  });
  it('omits invalid timezone locations and keeps valid rows', () => {
    const d = defaults(); d.groups[0].locations.push({ ...d.groups[0].locations[0], id: 'bad', zone: 'Invalid/Timezone' });
    const r = decodeConfiguration(envelope(d), defaults()); expect(r.data.groups[0].locations).toHaveLength(1); expect(r.issues.join(' ')).toContain('timezone');
  });
  it('recovers partially corrupted preferences independently', () => {
    const d = defaults(), raw = JSON.parse(envelope(d)); raw.data.settings = { ...d.settings, theme: 'light', hour12: 'false', widgetOpacity: 100, step: 0 };
    const r = decodeConfiguration(JSON.stringify(raw), d); expect(r.data.settings.theme).toBe('light'); expect(r.data.settings.hour12).toBe(true); expect(r.data.settings.widgetOpacity).toBe(.96); expect(r.issues.length).toBe(3);
  });
  it.each([null, [], 'bad', 3])('rejects a non-object root %#', input => expect(() => decodeConfiguration(JSON.stringify(input), defaults())).toThrow());
  it.each([0, -1, '1', null])('rejects invalid versions %#', version => expect(() => decodeConfiguration(envelope(defaults(), version), defaults())).toThrow());
  it('protects unsupported future schema', () => expect(() => decodeConfiguration(envelope(defaults(), 2), defaults())).toThrow(FutureSchemaError));
  it('rejects invalid JSON and oversized input', () => { expect(() => decodeConfiguration('{', defaults())).toThrow(); expect(() => decodeConfiguration(' '.repeat(2 * 1024 * 1024 + 1), defaults())).toThrow(); });
  it('handles null/empty group collections with a safe empty group', () => {
    for (const groups of [null, [], ['bad']]) { const raw = JSON.parse(envelope()); raw.data.groups = groups; const r = decodeConfiguration(JSON.stringify(raw), defaults()); expect(r.data.groups).toHaveLength(1); expect(r.data.groups[0].locations).toHaveLength(0); expect(r.data.groups[0].referenceId).toBeNull(); }
  });
  it('bounds group/location counts and label/ID sizes', () => {
    const d = defaults(); d.groups = Array.from({ length: 35 }, (_, i) => ({ ...d.groups[0], id: `g${i}`, locations: Array.from({ length: 35 }, (_, j) => ({ ...d.groups[0].locations[0], id: `p${i}-${j}`, note: 'x'.repeat(201) })) }));
    const r = decodeConfiguration(envelope(d), defaults()); expect(r.data.groups.length).toBe(32); expect(r.data.groups.every(g => g.locations.length === 32 && g.locations.every(l => l.note === undefined))).toBe(true);
  });
  it('invalid work/sleep fields cannot crash scheduling after recovery', () => {
    const raw = JSON.parse(envelope()); const l = raw.data.groups[0].locations[0]; l.work = { start: -1, end: 99999, days: [2, 2, 5], intervals: [null, { start: 5, end: 5 }] }; l.sleep = { start: 'bad', end: 2000 };
    const r = decodeConfiguration(JSON.stringify(raw), defaults()); expect(r.data.groups[0].locations[0].work.days).toEqual([2, 5]); expect(r.data.groups[0].locations[0].sleep).toEqual({ start: 1380, end: 420 });
  });
  it('does not accept prototype keys into the settings object', () => {
    const raw = JSON.parse(envelope()); raw.data.settings = JSON.parse('{"__proto__":{"polluted":true},"theme":"light"}');
    expect(Object.hasOwn(decodeConfiguration(JSON.stringify(raw), defaults()).data.settings, '__proto__')).toBe(false);
  });
});

describe('transaction ordering, hydration and recovery', () => {
  it('does not write while an asynchronous load is pending', async () => {
    const { storage, repo } = setup(); storage.values.set(CONFIGURATION_KEY, record(envelope()));
    let release!: () => void; const read = storage.read.bind(storage); storage.read = async key => { await new Promise<void>(r => { release = r; }); return read(key); };
    const load = repo.load(); repo.update(defaults()); await repo.flush(); expect(storage.writes).toBe(0); release(); await load; expect(storage.writes).toBe(0); repo.close();
  });
  it('coalesces rapid updates into the latest snapshot', async () => {
    const { repo, storage } = setup(); await repo.load();
    for (let i = 0; i < 100; i++) { const d = defaults(); d.meeting.title = String(i); repo.update(d); }
    await repo.flush(); expect(storage.writes).toBe(1); expect(saved(storage).meeting.title).toBe('99'); repo.close();
  });
  it('serializes updates arriving during an in-flight write', async () => {
    const { repo, storage } = setup(); await repo.load(); let release!: () => void;
    storage.delay = () => new Promise<void>(r => { release = r; });
    const first = defaults(); first.meeting.title = 'first'; repo.update(first); const flush = repo.flush();
    const last = defaults(); last.meeting.title = 'last'; repo.update(last); storage.delay = null; release(); await flush;
    expect(storage.writes).toBe(2); expect(saved(storage).meeting.title).toBe('last'); expect(JSON.parse(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).previous).data.meeting.title).toBe('first'); repo.close();
  });
  it('interrupted/failed commit preserves old complete bytes; retry saves latest changes', async () => {
    const { repo, storage, statuses } = setup(); const original = record(envelope()); storage.values.set(CONFIGURATION_KEY, original); await repo.load();
    storage.failWrite = true; const d = defaults(); d.settings.theme = 'light'; repo.update(d); await repo.flush();
    expect(storage.values.get(CONFIGURATION_KEY)).toBe(original); expect(statuses.at(-1)?.phase).toBe('error');
    d.meeting.title = 'latest after failure'; repo.update(d); storage.failWrite = false; await repo.retry(); expect(saved(storage).meeting.title).toBe('latest after failure'); repo.close();
  });
  it('read failures cannot overwrite previously saved settings', async () => {
    const { repo, storage, statuses } = setup(); const original = record(envelope()); storage.values.set(CONFIGURATION_KEY, original); storage.failRead = true;
    await repo.load(); repo.update(defaults()); await repo.flush(); expect(storage.values.get(CONFIGURATION_KEY)).toBe(original); expect(statuses.at(-1)?.phase).toBe('error'); expect(repo.canSave).toBe(false); repo.close();
  });
  it('recovers corrupt head from previous snapshot and retains original bytes permanently', async () => {
    const { repo, storage } = setup(); const previous = defaults(); previous.meeting.title = 'backup'; const original = record('{broken', envelope(previous)); storage.values.set(CONFIGURATION_KEY, original);
    const d = await repo.load(); expect(d.meeting.title).toBe('backup'); repo.update(d); await repo.flush();
    expect(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery).toBe(original);
    d.settings.theme = 'light'; repo.update(d); await repo.flush(); expect(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery).toBe(original); repo.close();
  });
  it('recovers invalid JSON wrapper without overwriting the recovery copy', async () => {
    const { repo, storage } = setup(); storage.values.set(CONFIGURATION_KEY, '{bad'); const data = await repo.load(); repo.update(data); await repo.flush(); expect(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery).toBe('{bad'); repo.close();
  });
  it('a later corruption retains the earlier recovery copy inside the full original record', async () => {
    const { repo, storage } = setup(); const first = '{first corruption'; const original = record('{later corruption', envelope(), first);
    storage.values.set(CONFIGURATION_KEY, original); const data = await repo.load(); repo.update(data); await repo.flush();
    const recovery = JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery;
    expect(recovery).toBe(original); expect(JSON.parse(recovery).recovery).toBe(first); repo.close();
  });
  it('invalid current schema uses the valid previous envelope', async () => {
    const { repo, storage } = setup(); const previous = defaults(); previous.settings.theme = 'light';
    storage.values.set(CONFIGURATION_KEY, record(envelope(defaults(), 0), envelope(previous)));
    const data = await repo.load(); expect(data.settings.theme).toBe('light'); repo.update(data); await repo.flush(); expect(saved(storage).settings.theme).toBe('light'); repo.close();
  });
  it('damaged backup metadata does not discard a valid current configuration', async () => {
    const { repo, storage } = setup(); const d = defaults(); d.settings.theme = 'light';
    const raw = JSON.stringify({ format: 1, current: envelope(d), previous: 42 }); storage.values.set(CONFIGURATION_KEY, raw);
    const loaded = await repo.load(); expect(loaded.settings.theme).toBe('light'); repo.update(loaded); await repo.flush();
    expect(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery).toBe(raw); repo.close();
  });
  it('preserves legacy bytes after migration and migration failure', async () => {
    for (const legacy of [JSON.stringify(defaults()), '{broken']) {
      const { repo, storage } = setup(); storage.values.set(LEGACY_KEY, legacy); const data = await repo.load(); repo.update(data); await repo.flush(); expect(storage.values.get(LEGACY_KEY)).toBe(legacy); expect(storage.values.has(CONFIGURATION_KEY)).toBe(true); repo.close();
    }
  });
  it('partial recovery retains valid settings and original input', async () => {
    const { repo, storage } = setup(); const raw = JSON.parse(envelope()); raw.data.settings.step = 'bad'; raw.data.settings.theme = 'light'; const original = record(JSON.stringify(raw)); storage.values.set(CONFIGURATION_KEY, original);
    const d = await repo.load(); expect(d.settings.theme).toBe('light'); expect(d.settings.step).toBe(5); repo.update(d); await repo.flush(); expect(JSON.parse(storage.values.get(CONFIGURATION_KEY)!).recovery).toBe(original); repo.close();
  });
  it.each([record(envelope(defaults(), 2)), JSON.stringify({ format: 2, current: '' })])('never overwrites unknown future schemas/formats %#', async raw => {
    const { repo, storage, statuses } = setup(); storage.values.set(CONFIGURATION_KEY, raw); await repo.load(); repo.update(defaults()); await repo.flush(); expect(storage.values.get(CONFIGURATION_KEY)).toBe(raw); expect(storage.writes).toBe(0); expect(statuses.at(-1)?.phase).toBe('blocked'); repo.close();
  });
  it('conflicts between two writers never silently overwrite another window', async () => {
    const { repo, storage, statuses } = setup(); await repo.load(); const second = new ConfigurationRepository(storage, defaults(), () => {}, 100000); await second.load();
    const a = defaults(); a.meeting.title = 'first writer'; second.update(a); await second.flush();
    const b = defaults(); b.meeting.title = 'stale writer'; repo.update(b); await repo.flush(); expect(saved(storage).meeting.title).toBe('first writer'); expect(statuses.at(-1)?.phase).toBe('blocked'); repo.close(); second.close();
  });
  it('no-op durable updates do not write clock/search state', async () => {
    const { repo, storage } = setup(); storage.values.set(CONFIGURATION_KEY, record(envelope())); const d = await repo.load(); repo.update(d); await repo.flush(); expect(storage.writes).toBe(0); repo.close();
  });
  it('debounces and flushes on close', async () => {
    vi.useFakeTimers(); const { repo, storage } = setup(); await repo.load(); repo.update(defaults()); expect(storage.writes).toBe(0); await vi.advanceTimersByTimeAsync(100000); expect(storage.writes).toBe(1); repo.close(); vi.useRealTimers();
  });
});

describe('configuration invariants and platform contract', () => {
  it('cannot delete the last group or select a missing group/reference', () => {
    const state = initialState(defaults()); expect(reducer(state, { type: 'group/delete', id: 'group' })).toBe(state);
    expect(reducer(state, { type: 'group/switch', id: 'missing' })).toBe(state);
    expect(reducer(state, { type: 'loc/reference', id: 'missing' }).groups).toEqual(state.groups);
  });
  it('removing a reference selects the next row, or null for an empty group', () => {
    const state = initialState(defaults()); const next = reducer(state, { type: 'loc/remove', id: 'p' }); expect(next.groups[0].referenceId).toBeNull();
  });
  it('native adapter uses only fixed configuration commands/keys', async () => {
    const invoke = vi.fn().mockResolvedValue(null); const storage = createTauriStorage(invoke);
    await storage.read(CONFIGURATION_KEY); await storage.compareAndSwap(CONFIGURATION_KEY, null, 'next');
    expect(invoke.mock.calls).toEqual([['longitude_read_configuration', { key: CONFIGURATION_KEY }], ['longitude_commit_configuration', { key: CONFIGURATION_KEY, expected: null, next: 'next' }]]);
    await expect(storage.read('../../secrets' as StorageKey)).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(2);
    await expect(storage.compareAndSwap(LEGACY_KEY as typeof CONFIGURATION_KEY, null, 'x')).rejects.toThrow('read-only'); expect(invoke).toHaveBeenCalledTimes(2);
  });
});
