import { describe, expect, it, vi } from 'vitest';
import { nativeSharing } from './sharing';
describe.each(['windows','macos'])('%s sharing platform contract', () => {
  it('writes only text using the fixed native command',async()=>{
    const invoke=vi.fn().mockResolvedValue(undefined),adapter=nativeSharing(invoke);
    expect(await adapter.copyText('Meeting 🙂\nUTC time')).toBe(true);expect(invoke).toHaveBeenCalledWith('longitude_copy_text',{text:'Meeting 🙂\nUTC time'});
  });
  it('handles native clipboard denial without a rejected UI promise',async()=>expect(await nativeSharing(vi.fn().mockRejectedValue('Denied')).copyText('Meeting')).toBe(false));
  it.each(['saved','cancelled'] as const)('distinguishes %s without accepting any destination path',async status=>{
    const invoke=vi.fn().mockResolvedValue({status}),adapter=nativeSharing(invoke);
    expect(await adapter.saveFile('meeting.ics','calendar','text/calendar')).toEqual({status});
    expect(invoke).toHaveBeenCalledWith('longitude_save_calendar',{name:'meeting.ics',contents:'calendar'});
  });
  it('reports filesystem failure separately from cancellation',async()=>expect(await nativeSharing(vi.fn().mockRejectedValue('Disk full')).saveFile('meeting.ics','calendar','text/calendar')).toEqual({status:'error',message:'Disk full'}));
  it('rejects non-calendar operations before IPC',async()=>{
    const invoke=vi.fn();expect((await nativeSharing(invoke).saveFile('x.txt','x','text/plain')).status).toBe('error');expect(invoke).not.toHaveBeenCalled();
  });
  it('rejects malformed native responses',async()=>expect((await nativeSharing(vi.fn().mockResolvedValue({path:'/arbitrary'})).saveFile('meeting.ics','calendar','text/calendar')).status).toBe('error'));
});
