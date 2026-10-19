import { suggestTimes } from '../lib/schedule';
import type { SearchInput } from './search-client';
self.onmessage = (event: MessageEvent<SearchInput>) => {
  try {
    const r = event.data;
    self.postMessage({ suggestions: suggestTimes(r.people, r.from, r.to, r.duration, r.near, r.count ?? 3, r.step ?? 30, r.options) });
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : 'Scheduling failed.' }); }
};
