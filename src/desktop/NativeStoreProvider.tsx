import React, { useEffect, useState } from 'react';
import { StoreCtx, useNow, type AppState, type StoreProviderProps } from '../state/store';
import { nativeInitialState } from './defaults';
import { ConfigurationRepository, type PersistenceStatus } from '../persistence/repository';
import { durable } from '../persistence/schema';
import { DesktopStateClient } from './state-client';
import type { Platform } from '../platform';

export function NativeStoreProvider(props: StoreProviderProps & { platform: Platform }) {
  const port = props.platform.desktop!;
  const [state, setState] = useState<AppState>(() => nativeInitialState(props.platform.os, props.initial));
  const [status, setStatus] = useState<PersistenceStatus>({ phase: 'loading', message: '' });
  const [client, setClient] = useState<DesktopStateClient | null>(null);
  const [attempt, retry] = useState(0);
  const now = useNow(props.fixedNow, true);
  useEffect(() => {
    let active = true; let unlisten = () => {}; let unerror = () => {}; let unquit = () => {}; let timer: ReturnType<typeof setTimeout>;
    const error = (message: string) => { if (active) setStatus({ phase: message ? 'error' : 'saved', message }); };
    const connection = new DesktopStateClient(port, next => { if (active) setState({ ...next, mode: port.label === 'widget' ? 'compact' : 'full' }); }, error);
    const connect = async () => {
      unlisten = await port.listen(snapshot => { connection.receive(snapshot); if (active) { setClient(connection); if (snapshot.warning) error(snapshot.warning); } });
      unerror = await port.onError(error);
      unquit = await port.beforeQuit?.(() => connection.settle()) ?? (() => {});
      if (!active) { unlisten(); unerror(); unquit(); return; }
      let snapshot = await port.snapshot();
      if (!snapshot && port.label === 'main') {
        const defaults = nativeInitialState(props.platform.os, props.initial);
        let loadStatus: PersistenceStatus = { phase: 'loading', message: '' };
        const repo = new ConfigurationRepository(props.platform.storage, durable(defaults), next => { loadStatus = next; if (active) setStatus(next); });
        const data = await repo.load();
        if (repo.needsReadRetry) { repo.close(); throw new Error('Could not read saved configuration. Retry loading; saved bytes are unchanged.'); }
        if (repo.canSave) { repo.update(data); await repo.flush(); }
        if ((loadStatus as PersistenceStatus).phase === 'error') { repo.close(); throw new Error(loadStatus.message); }
        const current = await props.platform.storage.read('longitude.configuration');
        // A failed first commit must not initialize an unsaved authority.
        if (repo.canSave && current === null) { repo.close(); throw new Error('Could not initialize native storage. Retry loading.'); }
        snapshot = await port.initialize({ ...defaults, ...data, mode: 'full', selected: null, view: 'clock' }, repo.canSave);
        repo.close();
      }
      if (!active) return;
      if (snapshot) { connection.receive(snapshot); setClient(connection); if (snapshot.warning) error(snapshot.warning); else setStatus(previous => previous.phase === 'loading' ? { phase: 'saved', message: '' } : previous); }
      else timer = setTimeout(() => { if (active) retry(n => n + 1); }, 500);
    };
    void connect().catch(e => error(String(e)));
    return () => { active = false; connection.stop(); clearTimeout(timer); unlisten(); unerror(); unquit(); };
  }, [port, props.platform, attempt]);
  if (!client) return <div className="lg-root flex h-full items-center justify-center p-6" role={status.phase === 'error' ? 'alert' : 'status'}>
    {status.message || 'Loading desktop configuration…'} {status.phase === 'error' && <button className="ml-3 underline" onClick={() => retry(n => n + 1)}>Retry</button>}
  </div>;
  return <StoreCtx.Provider value={{ state, dispatch: action => client.dispatch(action), platform: props.platform, now, persistence: status, retryPersistence: () => client.retry(), discardPending: () => client.discard() }}>{props.children}</StoreCtx.Provider>;
}
