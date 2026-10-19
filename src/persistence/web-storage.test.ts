import { describe, expect, it, vi, afterEach } from 'vitest';
import { createWebStorage } from './web-storage';
const key='longitude.configuration' as const;
afterEach(()=>vi.unstubAllGlobals());
function mock(){const values=new Map<string,string>();let fail=false;vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw new Error('QuotaExceeded');values.set(k,v);}});vi.stubGlobal('navigator',{locks:{request:async(_name:string,fn:()=>unknown)=>fn()}});return{values,fail:()=>{fail=true;}};}
describe('browser transaction adapter',()=>{
 it('atomically replaces only matching bytes',async()=>{const {values}=mock();const s=createWebStorage();expect(await s.compareAndSwap(key,null,'one')).toBe(true);expect(await s.compareAndSwap(key,null,'stale')).toBe(false);expect(values.get(key)).toBe('one');});
 it('a quota/interrupted set leaves the complete prior record intact',async()=>{const m=mock();m.values.set(key,'old');m.fail();await expect(createWebStorage().compareAndSwap(key,'old','new')).rejects.toThrow('QuotaExceeded');expect(m.values.get(key)).toBe('old');});
 it('read denial propagates instead of returning an empty preference set',async()=>{vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('Denied');}});await expect(createWebStorage().read(key)).rejects.toThrow('Denied');});
 it('refuses unsafe writes where cross-tab locking is unavailable',async()=>{mock();vi.stubGlobal('navigator',{});await expect(createWebStorage().compareAndSwap(key,null,'x')).rejects.toThrow('locking');});
});
