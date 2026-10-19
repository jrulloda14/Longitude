import type { Participant, SearchOptions, Suggestion } from '../lib/schedule';
export interface SearchInput { people: Participant[]; from: number; to: number; duration: number; near: number; count?: number; step?: number; options: SearchOptions }
export interface SearchWorker {
  onmessage: ((event: MessageEvent<{ suggestions?: Suggestion[]; error?: string }>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(input: SearchInput): void;
  terminate(): void;
}
export function largeSearch(input: SearchInput) {
  const candidates = Math.max(0, Math.floor((input.to - input.from - input.duration * 60000) / ((input.step ?? 30) * 60000)) + 1);
  return candidates * input.people.length > 8000;
}
function defaultWorker(): SearchWorker {
  if (typeof import.meta.url !== 'string') return new Worker('./search-worker.js', { type: 'module' });
  return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
}
export function runSchedulingSearch(input: SearchInput, create: () => SearchWorker = defaultWorker) {
  let worker: SearchWorker | undefined, rejectJob: (error: Error) => void = () => {};
  let finished = false;
  const promise = new Promise<Suggestion[]>((resolve, reject) => {
    rejectJob = reject;
    try {
      worker = create();
      worker.onmessage = ({ data }) => {
        if (finished) return; finished = true; worker?.terminate();
        if (data.error) reject(new Error(data.error)); else if (Array.isArray(data.suggestions)) resolve(data.suggestions); else reject(new Error('Invalid scheduling response.'));
      };
      worker.onerror = () => { if (!finished) { finished = true; worker?.terminate(); reject(new Error('Local scheduling worker failed. Run the search again.')); } };
      worker.postMessage(input);
    } catch (e) { finished = true; worker?.terminate(); reject(e); }
  });
  return { promise, cancel() { if (!finished) { finished = true; worker?.terminate(); rejectJob(new DOMException('Search cancelled', 'AbortError')); } } };
}
