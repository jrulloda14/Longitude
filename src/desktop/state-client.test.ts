import { expect, it } from 'vitest';
import { DesktopStateClient, type DesktopPort, type DesktopSnapshot } from './state-client';
import { initialState, type AppState } from '../state/store';
function setup() {
  let snapshot: DesktopSnapshot = { revision: 1, state: initialState(), origin: 'host', requestId: '' };
  let writes = 0, errors = '', visible = snapshot.state, controls: string[] = [];
  const port: DesktopPort = {
    label: 'main', snapshot: async () => snapshot, initialize: async () => snapshot,
    listen: async () => () => {}, onError: async () => () => {}, control: async action => { controls.push(action); },
    apply: async (revision, state, origin, requestId) => { writes++; if (revision !== snapshot.revision) return { accepted: false, snapshot }; snapshot = { revision: revision + 1, state, origin, requestId }; return { accepted: true, snapshot }; },
  };
  const client = new DesktopStateClient(port, state => { visible = state; }, message => { errors = message; }); client.receive(snapshot);
  return { client, port, get snapshot() { return snapshot; }, set snapshot(s) { snapshot = s; }, get visible() { return visible; }, get writes() { return writes; }, get errors() { return errors; }, controls };
}
it('coalesces rapid actions and preserves immediate optimistic clock updates', async () => {
  const s = setup(); for (let at = 1; at <= 100; at++) s.client.dispatch({ type: 'select', at });
  expect(s.visible.selected).toBe(100); await s.client.flush(); expect(s.snapshot.state.selected).toBe(100); expect(s.writes).toBe(1);
});
it('rebases conflicting edits against the current canonical state', async () => {
  const s = setup(); s.client.dispatch({ type: 'settings', patch: { theme: 'light' } });
  s.snapshot = { ...s.snapshot, revision: 2, state: { ...s.snapshot.state, meeting: { ...s.snapshot.state.meeting, title: 'Other window' } } };
  await s.client.flush(); expect(s.snapshot.state.settings.theme).toBe('light'); expect(s.snapshot.state.meeting.title).toBe('Other window'); expect(s.writes).toBe(2);
});
it('ignores out-of-order snapshots and does not echo broadcasts', async () => {
  const s = setup(); s.client.receive({ ...s.snapshot, revision: 3, state: { ...s.snapshot.state, selected: 123 } });
  s.client.receive({ ...s.snapshot, revision: 2 }); expect(s.visible.selected).toBe(123); await s.client.flush(); expect(s.writes).toBe(0);
});
it('acknowledges a matching event before its command reply without replaying actions', async () => {
  const s = setup(), apply = s.port.apply;
  s.port.apply = async (...args) => { const reply = await apply(...args); s.client.receive(reply.snapshot); return reply; };
  s.client.dispatch({ type: 'group/create', name: 'New group' }); const id = s.visible.activeGroupId;
  await s.client.flush(); expect(s.visible.groups.filter(g => g.name === 'New group')).toHaveLength(1); expect(s.visible.activeGroupId).toBe(id);
});
it('keeps stable IDs when a newly created group is edited before acknowledgement', async () => {
  const s = setup(); s.client.dispatch({ type: 'group/create', name: 'Draft' }); const id = s.visible.activeGroupId;
  s.client.dispatch({ type: 'group/rename', id, name: 'Renamed' }); await s.client.flush(); expect(s.snapshot.state.groups.find(g => g.id === id)?.name).toBe('Renamed');
});
it('duplicates with stable group and participant IDs through a conflict', async () => {
  const s = setup(); s.client.dispatch({ type: 'group/duplicate', id: s.visible.activeGroupId }); const copied = structuredClone(s.visible.groups.at(-1));
  s.snapshot = { ...s.snapshot, revision: 2 }; await s.client.flush(); expect(s.snapshot.state.groups.at(-1)).toEqual(copied);
});
it('routes window modes to native visibility without replacing canonical state', async () => {
  const s = setup(); s.client.dispatch({ type: 'mode', mode: 'compact' }); s.client.dispatch({ type: 'mode', mode: 'full' }); await s.client.flush(); expect(s.controls).toEqual(['widget', 'expand']); expect(s.writes).toBe(0);
});
it('failed writes retain pending changes, retry saves latest edit', async () => {
  const s = setup(), apply = s.port.apply; s.port.apply = async () => { throw new Error('Disk failed'); };
  s.client.dispatch({ type: 'settings', patch: { theme: 'light' } }); await s.client.flush(); expect(s.errors).toContain('Disk failed'); expect(s.snapshot.state.settings.theme).toBe('dark');
  s.client.dispatch({ type: 'meeting', patch: { title: 'Latest' } }); s.port.apply = apply; s.client.retry(); await new Promise(resolve => setTimeout(resolve, 0)); expect(s.snapshot.state.meeting.title).toBe('Latest'); expect(s.snapshot.state.settings.theme).toBe('light');
});
it('discard rolls back rejected preferences to the last confirmed snapshot', async () => {
  const s = setup(); s.port.apply = async () => { throw new Error('Shortcut already owned'); };
  s.client.dispatch({ type: 'settings', patch: { globalShortcut: 'Invalid' } }); await s.client.flush(); s.client.discard(); expect(s.visible.settings.globalShortcut).toBe('Ctrl+Alt+T'); expect(s.errors).toBe('');
});
it('conflict retry is bounded and stopped clients ignore snapshots', async () => {
  const s = setup(); s.port.apply = async () => ({ accepted: false, snapshot: s.snapshot });
  s.client.dispatch({ type: 'select', at: 123 }); await s.client.flush(); expect(s.errors).toContain('32 conflict retries'); s.client.stop(); s.client.receive({ ...s.snapshot, revision: 500 }); expect(s.visible.selected).toBe(123);
});
it('configuration is validated before IPC and replace actions are rejected', async () => {
  const s = setup(); s.client.dispatch({ type: 'settings', patch: { widgetOpacity: 2 } }); await s.client.flush(); expect(s.writes).toBe(0); expect(s.errors).toContain('Invalid configuration'); expect(() => s.client.dispatch({ type: 'replace', state: {} as AppState })).toThrow();
});
it('quit settling waits for an in-flight commit', async () => {
  const s = setup(), apply = s.port.apply; let release!: () => void;
  s.port.apply = async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return apply(...args); };
  s.client.dispatch({ type: 'settings', patch: { theme: 'light' } }); const saving = s.client.flush();
  let finished = false; const quitting = s.client.settle().then(() => { finished = true; });
  await Promise.resolve(); expect(finished).toBe(false); release(); await saving; await quitting; expect(s.snapshot.state.settings.theme).toBe('light');
});
it('quit settling refuses to discard a failed pending write', async () => {
  const s = setup(); s.port.apply = async () => { throw new Error('Disk failed'); };
  s.client.dispatch({ type: 'meeting', patch: { title: 'Unsaved' } }); await s.client.flush(); await expect(s.client.settle()).rejects.toThrow('Pending changes');
});
