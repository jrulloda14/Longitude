import { reducer, type Action, type AppState } from '../state/store';
import { decodeConfiguration, durable } from '../persistence/schema';

export interface DesktopSnapshot { revision: number; state: AppState; origin: string; requestId: string; warning?: string | null }
export interface DesktopReply { accepted: boolean; snapshot: DesktopSnapshot }
export interface DesktopPort {
  readonly label: 'main' | 'widget';
  snapshot(): Promise<DesktopSnapshot | null>;
  initialize(state: AppState, writable: boolean): Promise<DesktopSnapshot>;
  apply(revision: number, state: AppState, origin: string, requestId: string): Promise<DesktopReply>;
  listen(callback: (snapshot: DesktopSnapshot) => void): Promise<() => void>;
  control(action: string): Promise<void>;
  onError(callback: (message: string) => void): Promise<() => void>;
  beforeQuit?(flush: () => Promise<void>): Promise<() => void>;
}
/** Single reducer on both platforms. Native authority accepts revisioned,
 * validated transactions. Conflicts rebase pending actions, never overwrite. */
export class DesktopStateClient {
  private confirmed: DesktopSnapshot | null = null;
  private pending: Action[] = [];
  private running = false;
  private stopped = false;
  private failed = false;
  private sequence = 0;
  private inflight: { requestId: string; count: number } | null = null;
  readonly origin = crypto.randomUUID();
  constructor(private port: DesktopPort, private changed: (state: AppState) => void, private error: (message: string) => void) {}
  receive(snapshot: DesktopSnapshot) {
    if (this.stopped || (this.confirmed && snapshot.revision < this.confirmed.revision)) return;
    if (snapshot.origin === this.origin && this.inflight?.requestId === snapshot.requestId) {
      this.pending.splice(0, this.inflight.count); this.inflight = null;
    }
    this.confirmed = snapshot; this.render();
  }
  private render() { if (this.confirmed) this.changed(this.pending.reduce(reducer, this.confirmed.state)); }
  dispatch(action: Action) {
    if (action.type === 'mode') { void this.port.control(action.mode === 'compact' ? 'widget' : 'expand').catch(e => this.error(String(e))); return; }
    if (action.type === 'replace') throw new Error('Native snapshots cannot be replaced by frontend actions.');
    if (action.type === 'group/create') action = { ...action, id: action.id ?? crypto.randomUUID() };
    if (action.type === 'group/duplicate') {
      const visible = this.confirmed && this.pending.reduce(reducer, this.confirmed.state);
      const sourceId = action.id;
      const source = visible?.groups.find(group => group.id === sourceId);
      action = { ...action, copyId: crypto.randomUUID(), locationIds: Object.fromEntries((source?.locations ?? []).map(location => [location.id, crypto.randomUUID()])) };
    }
    this.pending.push(action); this.render(); queueMicrotask(() => { void this.flush(); });
  }
  async flush() {
    if (this.running || this.stopped || this.failed || !this.confirmed) return;
    this.running = true;
    let conflicts = 0;
    try {
      while (this.pending.length && !this.stopped && !this.failed) {
        const count = this.pending.length, current = this.confirmed!;
        const candidate = this.pending.slice(0, count).reduce(reducer, current.state);
        const clean = decodeConfiguration(JSON.stringify({ version: 1, revision: 0, data: durable(candidate) }), durable(current.state));
        if (clean.issues.length) throw new Error(`Invalid configuration: ${clean.issues.join(', ')}`);
        const next = { ...candidate, ...clean.data, mode: 'full' as const };
        const requestId = `${++this.sequence}`; this.inflight = { requestId, count };
        const reply = await this.port.apply(current.revision, next, this.origin, requestId);
        if (!reply.accepted) { this.inflight = null; this.receive(reply.snapshot); if (++conflicts > 32) throw new Error('Desktop state remained busy after 32 conflict retries'); continue; }
        // The matching broadcast may already have acknowledged this batch.
        if (this.inflight?.requestId === requestId) { this.pending.splice(0, count); this.inflight = null; }
        this.receive(reply.snapshot);
      }
    } catch (e) {
      this.inflight = null; this.failed = true;
      this.error(`${String(e)}. Changes remain pending; retry or reload to discard them.`);
    } finally { this.running = false; }
  }
  retry() { this.failed = false; this.error(''); void this.flush(); }
  discard() { this.failed = false; this.pending = []; this.render(); this.error(''); }
  async settle() {
    const deadline = Date.now() + 5000;
    while (this.running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    await this.flush();
    if (this.pending.length || this.running || this.failed) throw new Error('Pending changes could not be saved. Retry or discard them before quitting.');
  }
  stop() { this.stopped = true; }
}
