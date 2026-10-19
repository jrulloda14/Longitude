import { useEffect, useMemo, useState } from 'react';
import { suggestTimes, type Suggestion } from '../lib/schedule';
import { largeSearch, runSchedulingSearch, type SearchInput } from './search-client';
export function useSchedulingSearch(input: SearchInput) {
  const large = largeSearch(input), key = JSON.stringify(input);
  const [result, setResult] = useState<{ key: string; suggestions: Suggestion[]; error: string }>({ key: '', suggestions: [], error: '' });
  useEffect(() => {
    if (!large) return;
    let active = true; setResult({ key: '', suggestions: [], error: '' });
    const job = runSchedulingSearch(input);
    job.promise.then(suggestions => { if (active) setResult({ key, suggestions, error: '' }); }, e => { if (active) setResult({ key, suggestions: [], error: e.message }); });
    return () => { active = false; job.cancel(); };
  }, [input, key, large]);
  const immediate = useMemo(() => {
    if (large) return null;
    try { return { suggestions: suggestTimes(input.people, input.from, input.to, input.duration, input.near, input.count ?? 3, input.step ?? 30, input.options), error: '' }; }
    catch (e) { return { suggestions: [], error: (e as Error).message }; }
  }, [input, large]);
  return immediate ? { ...immediate, pending: false } : result.key === key ? { ...result, pending: false } : { suggestions: [], error: '', pending: true };
}
