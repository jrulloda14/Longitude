import { it, expect, vi } from 'vitest';
import { runSchedulingSearch, largeSearch, type SearchInput, type SearchWorker } from './search-client';
const input: SearchInput = { people: [], from: 0, to: 86400000, duration: 30, near: 0, options: {} };
const mock = (): SearchWorker => ({ onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() });
it('worker result resolves once and releases its resources', async () => {
 const worker=mock(), job=runSchedulingSearch(input,()=>worker); worker.onmessage!({data:{suggestions:[]}} as MessageEvent);
 await expect(job.promise).resolves.toEqual([]);expect(worker.terminate).toHaveBeenCalledTimes(1);
});
it('cancel terminates computation and rejects, stale responses cannot resolve it', async()=>{
 const worker=mock(),job=runSchedulingSearch(input,()=>worker);job.cancel();worker.onmessage!({data:{suggestions:[]}} as MessageEvent);
 await expect(job.promise).rejects.toHaveProperty('name','AbortError');expect(worker.terminate).toHaveBeenCalledTimes(1);
});
it('worker domain errors surface and terminate',async()=>{
 const worker=mock(),job=runSchedulingSearch(input,()=>worker);worker.onmessage!({data:{error:'Invalid range'}} as MessageEvent);
 await expect(job.promise).rejects.toThrow('Invalid range');expect(worker.terminate).toHaveBeenCalled();
});
it('worker creation failures surface',async()=>{await expect(runSchedulingSearch(input,()=>{throw new Error('Worker disabled');}).promise).rejects.toThrow('Worker disabled');});
it('worker execution failures surface',async()=>{const worker=mock(),job=runSchedulingSearch(input,()=>worker);worker.onerror!({} as ErrorEvent);await expect(job.promise).rejects.toThrow('worker failed');expect(worker.terminate).toHaveBeenCalled();});
it('invalid responses reject instead of fabricating results',async()=>{const worker=mock(),job=runSchedulingSearch(input,()=>worker);worker.onmessage!({data:{}} as MessageEvent);await expect(job.promise).rejects.toThrow('Invalid scheduling response');});
it('only large workloads select the worker path',()=>{
 expect(largeSearch(input)).toBe(false);
 expect(largeSearch({...input, people:Array(32).fill({}),to:31*86400000})).toBe(true);
});
